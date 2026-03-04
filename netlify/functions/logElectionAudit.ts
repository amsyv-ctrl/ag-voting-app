import type { Handler } from '@netlify/functions'
import { supabaseAdmin } from './_supabase'

type Body = {
  action?: string
  event_id?: string | null
  ballot_id?: string | null
  metadata?: Record<string, unknown>
}

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

  const action = payload.action?.trim()
  if (!action) {
    return { statusCode: 400, body: JSON.stringify({ error: 'action is required' }) }
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
    return { statusCode: 403, body: JSON.stringify({ error: 'Only org admins can write election audit logs' }) }
  }

  const eventId = payload.event_id?.trim() || null
  const ballotId = payload.ballot_id?.trim() || null

  if (eventId) {
    const { data: eventRow, error: eventError } = await supabaseAdmin
      .from('events')
      .select('id,org_id')
      .eq('id', eventId)
      .maybeSingle()
    if (eventError || !eventRow || eventRow.org_id !== membership.org_id) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Event is outside your organization scope' }) }
    }
  }

  if (ballotId) {
    const { data: ballotRow, error: ballotError } = await supabaseAdmin
      .from('ballots')
      .select('id,event_id')
      .eq('id', ballotId)
      .maybeSingle()
    if (ballotError || !ballotRow?.event_id) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Ballot is outside your organization scope' }) }
    }
    const { data: ballotEvent, error: ballotEventError } = await supabaseAdmin
      .from('events')
      .select('id,org_id')
      .eq('id', ballotRow.event_id)
      .maybeSingle()
    if (ballotEventError || !ballotEvent || ballotEvent.org_id !== membership.org_id) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Ballot is outside your organization scope' }) }
    }
  }

  const { error: insertError } = await supabaseAdmin
    .from('election_audit_log')
    .insert({
      org_id: membership.org_id,
      event_id: eventId,
      ballot_id: ballotId,
      action,
      actor_user_id: user.id,
      metadata: payload.metadata ?? {}
    })

  if (insertError) {
    return { statusCode: 500, body: JSON.stringify({ error: insertError.message }) }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true })
  }
}
