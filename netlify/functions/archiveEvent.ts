import type { Handler } from '@netlify/functions'
import { getEntitlementFromAuthHeader } from './_entitlement'
import { supabaseAdmin } from './_supabase'

type Body = {
  eventId?: string
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const entitlement = await getEntitlementFromAuthHeader(event.headers.authorization)
  if (!entitlement) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  if (entitlement.role === 'STAFF') {
    return { statusCode: 403, body: JSON.stringify({ error: 'Only org admins can archive events' }) }
  }

  const payload = JSON.parse(event.body || '{}') as Body
  const eventId = payload.eventId?.trim()
  if (!eventId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'eventId is required' }) }
  }

  const { data: eventRow, error: eventError } = await supabaseAdmin
    .from('events')
    .select('id,org_id,archived_at')
    .eq('id', eventId)
    .maybeSingle()

  if (eventError || !eventRow || eventRow.org_id !== entitlement.orgId) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Event not found or forbidden' }) }
  }

  const operate = await entitlement.canOperateEvent(eventId)
  if (!operate.allowed) {
    console.warn('archiveEvent denied', {
      userId: entitlement.userId,
      orgId: entitlement.orgId,
      eventId,
      reason: operate.reason
    })
    return { statusCode: 403, body: JSON.stringify({ error: 'Event not found or forbidden' }) }
  }

  if (eventRow.archived_at) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, eventId, closedOpenBallots: 0 })
    }
  }

  const nowIso = new Date().toISOString()
  const { error: archiveError } = await supabaseAdmin
    .from('events')
    .update({ archived_at: nowIso, archived_by: entitlement.userId })
    .eq('id', eventId)

  if (archiveError) {
    return { statusCode: 500, body: JSON.stringify({ error: archiveError.message }) }
  }

  const { data: closedRows, error: closeError } = await supabaseAdmin
    .from('ballots')
    .update({ status: 'CLOSED', closes_at: nowIso })
    .eq('event_id', eventId)
    .eq('status', 'OPEN')
    .is('deleted_at', null)
    .select('id')

  if (closeError) {
    return { statusCode: 500, body: JSON.stringify({ error: closeError.message }) }
  }

  const closedOpenBallots = Array.isArray(closedRows) ? closedRows.length : 0

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, eventId, closedOpenBallots })
  }
}
