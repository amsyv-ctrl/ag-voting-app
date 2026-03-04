import type { Handler } from '@netlify/functions'
import { supabaseAdmin } from './_supabase'

type Body = {
  receipt_code?: string
}

function normalizeReceiptCode(value: string) {
  const cleaned = value.trim().toUpperCase().replace(/[^A-F0-9]/g, '')
  if (cleaned.length < 8) return ''
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`
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

  const receiptCode = payload.receipt_code ? normalizeReceiptCode(payload.receipt_code) : ''
  if (!receiptCode) {
    return { statusCode: 400, body: JSON.stringify({ error: 'receipt_code is required' }) }
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (membershipError || !membership?.org_id) {
    return { statusCode: 403, body: JSON.stringify({ error: membershipError?.message ?? 'No organization found for user' }) }
  }

  const { data: voteRow, error: voteLookupError } = await supabaseAdmin
    .from('votes')
    .select('ballot_id,vote_round,created_at')
    .eq('receipt_code', receiptCode)
    .maybeSingle()

  if (voteLookupError) {
    return { statusCode: 500, body: JSON.stringify({ error: voteLookupError.message }) }
  }

  if (!voteRow) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ found: false })
    }
  }

  const { data: ballotRow, error: ballotLookupError } = await supabaseAdmin
    .from('ballots')
    .select('id,event_id')
    .eq('id', voteRow.ballot_id)
    .maybeSingle()

  if (ballotLookupError || !ballotRow?.event_id) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ found: false })
    }
  }

  const { data: eventRow, error: eventLookupError } = await supabaseAdmin
    .from('events')
    .select('id,org_id')
    .eq('id', ballotRow.event_id)
    .maybeSingle()

  if (eventLookupError || !eventRow || eventRow.org_id !== membership.org_id) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ found: false })
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      found: true,
      ballot_id: ballotRow.id,
      event_id: ballotRow.event_id,
      round: voteRow.vote_round,
      created_at: voteRow.created_at
    })
  }
}
