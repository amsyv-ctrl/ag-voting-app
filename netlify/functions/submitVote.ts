import type { Handler } from '@netlify/functions'
import { checkLimit, registerFailure, registerSuccess } from './_rateLimit'
import { supabaseAdmin } from './_supabase'

type Body = {
  slug?: string
  pin?: string
  choiceId?: string
  deviceFingerprintHash?: string | null
}

function getIp(event: Parameters<Handler>[0]) {
  return (
    event.headers['x-nf-client-connection-ip'] ||
    event.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    'unknown'
  )
}

function makeRateKey(ip: string, slug: string | undefined) {
  return `${ip}:${slug?.trim().toLowerCase() || 'unknown'}`
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const ip = getIp(event)

  let payload: Body = {}
  try {
    payload = JSON.parse(event.body || '{}') as Body
  } catch {
    const key = makeRateKey(ip, undefined)
    registerFailure(key)
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON payload' }) }
  }

  const slug = payload.slug?.trim()
  const pin = payload.pin?.trim()
  const choiceId = payload.choiceId?.trim()
  const rateKey = makeRateKey(ip, slug)
  const rate = checkLimit(rateKey)
  if (rate.blocked) {
    return {
      statusCode: 429,
      body: JSON.stringify({ error: `Too many attempts. Retry in ${rate.retryAfter}s` })
    }
  }

  if (!slug || !choiceId) {
    registerFailure(rateKey)
    return { statusCode: 400, body: JSON.stringify({ error: 'slug and choiceId are required' }) }
  }

  const { data, error } = await supabaseAdmin.rpc('submit_vote_atomic', {
    p_slug: slug,
    p_pin_code: pin ?? null,
    p_choice_id: choiceId,
    p_device_fingerprint_hash: payload.deviceFingerprintHash ?? null
  })

  if (error) {
    registerFailure(rateKey)
    return { statusCode: 400, body: JSON.stringify({ error: error.message }) }
  }

  registerSuccess(rateKey)
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: data.message, submittedAt: data.submittedAt })
  }
}
