import type { Handler } from '@netlify/functions'
import { getEntitlementFromAuthHeader } from './_entitlement'
import { supabaseAdmin } from './_supabase'

type Body = {
  eventId?: string
}

function csvCell(value: unknown) {
  const str = String(value ?? '')
  return `"${str.replace(/"/g, '""')}"`
}

function csvPinCell(pin: unknown) {
  const normalized = String(pin ?? '').replace(/\D/g, '').slice(0, 4).padStart(4, '0')
  return csvCell(`="${normalized}"`)
}

function safeSlug(input: string | null | undefined) {
  return (input ?? 'event')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'event'
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
    return { statusCode: 403, body: JSON.stringify({ error: 'Only org admins can export PINs' }) }
  }

  const payload = JSON.parse(event.body || '{}') as Body
  const eventId = payload.eventId?.trim()
  if (!eventId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'eventId is required' }) }
  }

  const { data: eventRow, error: eventError } = await supabaseAdmin
    .from('events')
    .select('id,org_id,name')
    .eq('id', eventId)
    .maybeSingle()

  if (eventError || !eventRow) {
    return { statusCode: 404, body: JSON.stringify({ error: eventError?.message ?? 'Event not found' }) }
  }

  const operate = await entitlement.canOperateEvent(eventId)
  if (!operate.allowed) {
    console.warn('exportPinsCsv denied', {
      userId: entitlement.userId,
      orgId: entitlement.orgId,
      eventId,
      reason: operate.reason
    })
    return { statusCode: 403, body: JSON.stringify({ error: 'Event not found or forbidden' }) }
  }

  const { data: pinRows, error: pinsError } = await supabaseAdmin
    .from('pins')
    .select('code,is_active,created_at,disabled_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })

  if (pinsError) {
    return { statusCode: 500, body: JSON.stringify({ error: pinsError.message }) }
  }

  const lines: string[] = []
  lines.push(['Pin', 'Status', 'Created At', 'Disabled At'].map(csvCell).join(','))

  for (const row of pinRows ?? []) {
    const status = row.disabled_at || row.is_active === false ? 'DISABLED' : 'ACTIVE'
    lines.push([
      csvPinCell(row.code),
      status,
      row.created_at ?? '',
      row.disabled_at ?? ''
    ].map((value, index) => index === 0 ? String(value) : csvCell(value)).join(','))
  }

  const datePart = new Date().toISOString().slice(0, 10)
  const filename = `event_pins_${safeSlug(eventRow.name)}_${datePart}.csv`

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`
    },
    body: lines.join('\n')
  }
}
