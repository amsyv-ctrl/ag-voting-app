import type { Handler } from '@netlify/functions'
import { createHash } from 'node:crypto'
import { getEntitlementFromAuthHeader } from './_entitlement'
import { supabaseAdmin } from './_supabase'

type Body = {
  event_id?: string
}

type BallotRow = {
  id: string
  title: string
  majority_rule: 'SIMPLE' | 'TWO_THIRDS'
}

type SealRow = {
  ballot_id: string
  vote_round: number
  majority_rule: 'SIMPLE' | 'TWO_THIRDS'
  threshold_required: 'SIMPLE' | 'TWO_THIRDS'
  total_votes: number
  counts: Record<string, number>
  closed_at: string
  seal_short: string
  seal_hash: string
}

type AuditRow = {
  action: string
  created_at: string
  actor_user_id: string | null
  event_id: string | null
  ballot_id: string | null
  metadata: Record<string, unknown>
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function sha256Hex(input: string) {
  return createHash('sha256').update(input).digest('hex')
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep)
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortKeysDeep(obj[key])
    }
    return out
  }
  return value
}

function canonicalJsonString(value: unknown) {
  return JSON.stringify(sortKeysDeep(value))
}

function computeWinnerFromCounts(
  counts: Record<string, number>,
  totalVotes: number,
  majorityRule: 'SIMPLE' | 'TWO_THIRDS'
) {
  const entries = Object.entries(counts)
    .map(([choiceId, votes]) => ({ choiceId, votes: Number(votes) || 0 }))
    .sort((a, b) => b.votes - a.votes || a.choiceId.localeCompare(b.choiceId))

  if (totalVotes <= 0 || entries.length === 0) {
    return { choice_id: null as string | null, topChoiceId: null as string | null }
  }

  const top = entries[0]
  const second = entries[1]
  if (second && second.votes === top.votes) {
    return { choice_id: null as string | null, topChoiceId: top.choiceId }
  }

  const topPct = top.votes / totalVotes
  if (majorityRule === 'SIMPLE' && topPct <= 0.5) {
    return { choice_id: null as string | null, topChoiceId: top.choiceId }
  }
  if (majorityRule === 'TWO_THIRDS' && topPct < (2 / 3)) {
    return { choice_id: null as string | null, topChoiceId: top.choiceId }
  }

  return { choice_id: top.choiceId, topChoiceId: top.choiceId }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const entitlement = await getEntitlementFromAuthHeader(event.headers.authorization)
  if (!entitlement) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  }
  if (entitlement.role !== 'OWNER' && entitlement.role !== 'ADMIN') {
    return { statusCode: 403, body: JSON.stringify({ error: 'Only org admins can export official records' }) }
  }

  let payload: Body = {}
  try {
    payload = JSON.parse(event.body || '{}') as Body
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON payload' }) }
  }

  const eventId = payload.event_id?.trim()
  if (!eventId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'event_id is required' }) }
  }

  const { data: orgRow, error: orgError } = await supabaseAdmin
    .from('organizations')
    .select('id,name')
    .eq('id', entitlement.orgId)
    .single()
  if (orgError || !orgRow) {
    return { statusCode: 400, body: JSON.stringify({ error: orgError?.message ?? 'Organization not found' }) }
  }

  const { data: eventRow, error: eventError } = await supabaseAdmin
    .from('events')
    .select('id,name,org_id')
    .eq('id', eventId)
    .maybeSingle()
  if (eventError || !eventRow || eventRow.org_id !== entitlement.orgId) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Event is outside your organization scope' }) }
  }

  const { data: ballotsData, error: ballotsError } = await supabaseAdmin
    .from('ballots')
    .select('id,title,majority_rule')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })
  if (ballotsError) {
    return { statusCode: 500, body: JSON.stringify({ error: ballotsError.message }) }
  }
  const ballots = (ballotsData ?? []) as BallotRow[]

  const ballotIds = ballots.map((b) => b.id)
  const { data: choiceData, error: choiceError } = await supabaseAdmin
    .from('choices')
    .select('id,label,ballot_id')
    .in('ballot_id', ballotIds.length > 0 ? ballotIds : ['00000000-0000-0000-0000-000000000000'])
  if (choiceError) {
    return { statusCode: 500, body: JSON.stringify({ error: choiceError.message }) }
  }
  const choiceLabelById = new Map<string, string>()
  for (const choice of (choiceData ?? []) as Array<{ id: string; label: string }>) {
    choiceLabelById.set(choice.id, choice.label)
  }

  const { data: sealsData, error: sealsError } = await supabaseAdmin
    .from('election_result_seals')
    .select('ballot_id,vote_round,majority_rule,threshold_required,total_votes,counts,closed_at,seal_short,seal_hash')
    .eq('org_id', entitlement.orgId)
    .eq('event_id', eventId)
    .order('vote_round', { ascending: true })
  if (sealsError) {
    return { statusCode: 500, body: JSON.stringify({ error: sealsError.message }) }
  }
  const seals = (sealsData ?? []) as unknown as SealRow[]

  const sealsByBallot = new Map<string, SealRow[]>()
  for (const seal of seals) {
    const existing = sealsByBallot.get(seal.ballot_id) ?? []
    existing.push(seal)
    sealsByBallot.set(seal.ballot_id, existing)
  }

  const { data: auditData, error: auditError } = await supabaseAdmin
    .from('election_audit_log')
    .select('action,created_at,actor_user_id,event_id,ballot_id,metadata')
    .eq('org_id', entitlement.orgId)
    .eq('event_id', eventId)
    .in('action', ['BALLOT_OPENED', 'BALLOT_CLOSED', 'BALLOT_ROUND_SEALED'])
    .order('created_at', { ascending: true })
  if (auditError) {
    return { statusCode: 500, body: JSON.stringify({ error: auditError.message }) }
  }

  const exportAt = new Date().toISOString()
  const eventSlug = `${slugify(eventRow.name || 'event')}-${eventRow.id.slice(0, 8)}`
  const ballotsOut = ballots.map((ballot) => {
    const rounds = (sealsByBallot.get(ballot.id) ?? [])
      .sort((a, b) => a.vote_round - b.vote_round)
      .map((seal) => {
        const countsRaw = (seal.counts ?? {}) as Record<string, number>
        const countsSorted: Record<string, number> = {}
        for (const key of Object.keys(countsRaw).sort()) {
          countsSorted[key] = Number(countsRaw[key]) || 0
        }

        const winnerCalc = computeWinnerFromCounts(countsSorted, Number(seal.total_votes) || 0, seal.majority_rule)
        const winnerChoiceId = winnerCalc.choice_id
        const winnerLabel = winnerChoiceId ? (choiceLabelById.get(winnerChoiceId) ?? null) : null

        return {
          round: seal.vote_round,
          status: 'CLOSED',
          closed_at: seal.closed_at,
          total_votes: seal.total_votes,
          counts: countsSorted,
          seal_short: seal.seal_short,
          seal_hash: seal.seal_hash,
          winner: {
            choice_id: winnerChoiceId,
            label: winnerLabel
          }
        }
      })

    return {
      ballot_id: ballot.id,
      title: ballot.title,
      majority_rule: ballot.majority_rule,
      rounds
    }
  })

  const basePayload = {
    schema_version: '1.0',
    exported_at: exportAt,
    org: {
      id: orgRow.id,
      name: orgRow.name
    },
    event: {
      id: eventRow.id,
      name: eventRow.name,
      slug: eventSlug
    },
    ballots: ballotsOut,
    audit_log: (auditData ?? []) as AuditRow[]
  }

  const canonical = canonicalJsonString(basePayload)
  const fileHash = sha256Hex(canonical)
  const finalPayload = {
    ...basePayload,
    integrity: {
      file_hash_sha256: fileHash,
      hashing_note: 'file_hash_sha256 is computed from the canonical JSON payload without this integrity block (see code).'
    }
  }

  console.log('exportOfficialRecord', {
    org_id: entitlement.orgId,
    event_id: eventId,
    ballots: ballotsOut.length,
    rounds_sealed: seals.length
  })

  const fileDate = exportAt.slice(0, 10)
  const filename = `event_record_${eventSlug}_${fileDate}.json`

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename=\"${filename}\"`
    },
    body: JSON.stringify(finalPayload, null, 2)
  }
}
