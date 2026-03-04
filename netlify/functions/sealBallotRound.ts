import type { Handler } from '@netlify/functions'
import { supabaseAdmin } from './_supabase'

type Body = {
  ballot_id?: string
  round?: number
}

const sealSecret = process.env.SEAL_SECRET

async function validateAdmin(authHeader: string | undefined) {
  const token = authHeader?.replace('Bearer ', '').trim()
  if (!token) return null

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data.user) return null
  return data.user
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  if (!sealSecret) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing SEAL_SECRET' }) }
  }

  const user = await validateAdmin(event.headers.authorization)
  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  let payload: Body = {}
  try {
    payload = JSON.parse(event.body || '{}') as Body
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON payload' }) }
  }

  const ballotId = payload.ballot_id?.trim()
  const round = Number(payload.round)
  if (!ballotId || !Number.isInteger(round) || round < 1) {
    return { statusCode: 400, body: JSON.stringify({ error: 'ballot_id and round are required' }) }
  }

  const { data: membership, error: memberError } = await supabaseAdmin
    .from('org_members')
    .select('org_id,role')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (memberError || !membership?.org_id) {
    return { statusCode: 403, body: JSON.stringify({ error: memberError?.message ?? 'No organization found for user' }) }
  }
  if (membership.role !== 'OWNER' && membership.role !== 'ADMIN') {
    return { statusCode: 403, body: JSON.stringify({ error: 'Only org admins can seal ballot rounds' }) }
  }

  const { data: sealData, error: sealError } = await supabaseAdmin.rpc('seal_ballot_round', {
    p_org_id: membership.org_id,
    p_ballot_id: ballotId,
    p_round: round,
    p_seal_secret: sealSecret
  })

  if (sealError) {
    return { statusCode: 400, body: JSON.stringify({ error: sealError.message }) }
  }

  const seal = Array.isArray(sealData) ? sealData[0] : sealData
  if (!seal) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Sealing failed' }) }
  }

  const { data: ballotInfo } = await supabaseAdmin
    .from('ballots')
    .select('event_id,majority_rule')
    .eq('id', ballotId)
    .maybeSingle()

  const eventId = ballotInfo?.event_id ?? null
  const majorityRule = ballotInfo?.majority_rule ?? null

  await supabaseAdmin
    .from('election_audit_log')
    .insert([
      {
        org_id: membership.org_id,
        event_id: eventId,
        ballot_id: ballotId,
        action: 'BALLOT_CLOSED',
        actor_user_id: user.id,
        metadata: { round }
      },
      {
        org_id: membership.org_id,
        event_id: eventId,
        ballot_id: ballotId,
        action: 'BALLOT_ROUND_SEALED',
        actor_user_id: user.id,
        metadata: {
          round,
          seal_short: seal.seal_short,
          seal_hash: seal.seal_hash,
          total_votes: seal.total_votes,
          majority_rule: majorityRule
        }
      }
    ])

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      seal_short: seal.seal_short,
      seal_hash: seal.seal_hash,
      total_votes: seal.total_votes
    })
  }
}
