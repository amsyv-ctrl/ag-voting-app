import type { Handler } from '@netlify/functions'
import { getEntitlementFromAuthHeader } from './_entitlement'
import { supabaseAdmin } from './_supabase'

type Body = {
  eventId?: string
  pin?: string
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
    return { statusCode: 403, body: JSON.stringify({ error: 'Only org admins can disable PINs' }) }
  }

  const payload = JSON.parse(event.body || '{}') as Body
  const eventId = payload.eventId?.trim()
  const pin = payload.pin?.trim()

  if (!eventId || !pin) {
    return { statusCode: 400, body: JSON.stringify({ error: 'eventId and pin are required' }) }
  }

  if (!/^\d{4}$/.test(pin)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'PIN must be a 4-digit code' }) }
  }

  const { data: eventRow, error: eventError } = await supabaseAdmin
    .from('events')
    .select('id,org_id')
    .eq('id', eventId)
    .maybeSingle()

  if (eventError || !eventRow || eventRow.org_id !== entitlement.orgId) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Event not found or forbidden' }) }
  }

  const operate = await entitlement.canOperateEvent(eventId)
  if (!operate.allowed) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Event is read-only' }) }
  }

  const { data: pinRow, error: pinError } = await supabaseAdmin
    .from('pins')
    .select('id,code,is_active,disabled_at')
    .eq('event_id', eventId)
    .eq('code', pin)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (pinError) {
    return { statusCode: 500, body: JSON.stringify({ error: pinError.message }) }
  }

  if (!pinRow) {
    return { statusCode: 404, body: JSON.stringify({ error: 'PIN not found for this event' }) }
  }

  if (pinRow.disabled_at || pinRow.is_active === false) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, pin: pinRow.code, alreadyDisabled: true })
    }
  }

  const { error: updateError } = await supabaseAdmin
    .from('pins')
    .update({
      is_active: false,
      disabled_at: new Date().toISOString(),
      disabled_by: entitlement.userId
    })
    .eq('id', pinRow.id)

  if (updateError) {
    return { statusCode: 500, body: JSON.stringify({ error: updateError.message }) }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, pin: pinRow.code, alreadyDisabled: false })
  }
}
