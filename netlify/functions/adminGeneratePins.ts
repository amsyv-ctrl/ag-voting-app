import type { Handler } from '@netlify/functions'
import { getEntitlementFromAuthHeader } from './_entitlement'
import { supabaseAdmin } from './_supabase'

type Body = {
  eventId?: string
  count?: number
}

function generate4DigitPin() {
  return Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, '0')
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const entitlement = await getEntitlementFromAuthHeader(event.headers.authorization)
  if (!entitlement) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  const payload = JSON.parse(event.body || '{}') as Body
  const eventId = payload.eventId?.trim()
  const count = Math.max(1, Math.min(payload.count ?? 100, 500))

  if (!eventId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'eventId is required' }) }
  }

  const { data: eventRow, error: eventError } = await supabaseAdmin
    .from('events')
    .select('id,org_id')
    .eq('id', eventId)
    .single()

  if (eventError || !eventRow) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Event not found or forbidden' }) }
  }

  const operate = await entitlement.canOperateEvent(eventId)
  if (!operate.allowed) {
    console.warn('adminGeneratePins denied', {
      userId: entitlement.userId,
      orgId: entitlement.orgId,
      eventId,
      reason: operate.reason
    })
    return { statusCode: 403, body: JSON.stringify({ error: 'Event not found or forbidden' }) }
  }

  const generated: string[] = []
  const insertRows: Array<{ event_id: string; code: string; is_active: boolean }> = []

  for (let i = 0; i < count; i += 1) {
    const pin = generate4DigitPin()
    generated.push(pin)
    insertRows.push({
      event_id: eventId,
      code: pin,
      is_active: true
    })
  }

  const { error: insertError } = await supabaseAdmin.from('pins').insert(insertRows)

  if (insertError) {
    return { statusCode: 500, body: JSON.stringify({ error: insertError.message }) }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ generated, total: generated.length })
  }
}
