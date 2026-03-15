import type { Handler } from '@netlify/functions'
import { createHash, randomUUID } from 'node:crypto'
import { checkLimit, registerFailure, registerSuccess } from './_rateLimit'
import { supabaseAdmin } from './_supabase'

type Body = {
  slug?: string
  pin?: string
  choiceId?: string
  deviceFingerprintHash?: string | null
}

const STARTER_ALLOWANCE = 500
const GROWTH_ALLOWANCE = 2000
const NETWORK_ALLOWANCE = 5000
const OVERAGE_RATE_CENTS = 50
const receiptSecret = process.env.VOTE_RECEIPT_SECRET || process.env.RECEIPT_SECRET

function allowanceFromOrg(org: { mode: string; stripe_price_id: string | null; trial_votes_limit?: number | null }) {
  if (org.mode === 'TRIAL') {
    return Math.max(org.trial_votes_limit ?? 100, 0)
  }

  if (org.stripe_price_id === process.env.STRIPE_PRICE_STARTER) return STARTER_ALLOWANCE
  if (org.stripe_price_id === process.env.STRIPE_PRICE_GROWTH) return GROWTH_ALLOWANCE
  if (org.stripe_price_id === process.env.STRIPE_PRICE_NETWORK) return NETWORK_ALLOWANCE
  return 0
}

function sha256Hex(input: string) {
  return createHash('sha256').update(input).digest('hex')
}

function toReceiptCode(hex: string, chars: number) {
  const raw = hex.slice(0, chars).toUpperCase()
  return `${raw.slice(0, 4)}-${raw.slice(4)}`
}

async function attachVoteReceipt(voteId: string, submittedAt: string) {
  const lengths = [8, 10, 12, 14, 16, 20]
  if (!receiptSecret) {
    throw new Error('Missing VOTE_RECEIPT_SECRET/RECEIPT_SECRET')
  }

  for (let attempt = 0; attempt < 12; attempt++) {
    const nonce = attempt === 0 ? '' : `:${randomUUID()}`
    const base = `${voteId}:${submittedAt}:${receiptSecret}${nonce}`
    const hash = sha256Hex(base)
    const chars = lengths[Math.min(attempt, lengths.length - 1)]
    const code = toReceiptCode(hash, chars)

    const { error } = await supabaseAdmin
      .from('votes')
      .update({ receipt_hash: hash, receipt_code: code })
      .eq('id', voteId)
      .is('receipt_hash', null)

    if (!error) {
      return { hash, code }
    }

    if (error.code === '23505') {
      continue
    }

    throw new Error(error.message)
  }

  throw new Error('Could not generate a unique receipt code')
}

function getIp(event: Parameters<Handler>[0]) {
  return (
    event.headers['x-nf-client-connection-ip'] ||
    event.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    'unknown'
  )
}

function makeRateContext(ip: string, payload: Body) {
  const slug = payload.slug?.trim().toLowerCase() || 'unknown'
  const pin = payload.pin?.trim() || 'no-pin'
  const fingerprint = payload.deviceFingerprintHash?.trim() || `ip:${ip}`
  return {
    roomKey: `${ip}:${slug}`,
    subjectKey: `${slug}:${fingerprint}:${pin}`
  }
}

function shouldRegisterFailure(message: string) {
  return [
    'Invalid JSON payload',
    'slug and choiceId are required',
    'Ballot not found',
    'PIN must be a 4-digit code',
    'Invalid PIN',
    'PIN_DISABLED',
    'Invalid choice'
  ].includes(message)
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
    const rateContext = makeRateContext(ip, {})
    registerFailure(rateContext.subjectKey, rateContext.roomKey)
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON payload' }) }
  }

  const slug = payload.slug?.trim()
  const pin = payload.pin?.trim()
  const choiceId = payload.choiceId?.trim()
  const rateContext = makeRateContext(ip, payload)
  const rate = checkLimit(rateContext.subjectKey, rateContext.roomKey)
  if (rate.blocked) {
    return {
      statusCode: 429,
      body: JSON.stringify({ error: `Too many attempts. Retry in ${rate.retryAfter}s` })
    }
  }

  if (!slug || !choiceId) {
    registerFailure(rateContext.subjectKey, rateContext.roomKey)
    return { statusCode: 400, body: JSON.stringify({ error: 'slug and choiceId are required' }) }
  }
  if (!receiptSecret) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server configuration error: missing VOTE_RECEIPT_SECRET' })
    }
  }

  const { data, error } = await supabaseAdmin.rpc('submit_vote_atomic', {
    p_slug: slug,
    p_pin_code: pin ?? null,
    p_choice_id: choiceId,
    p_device_fingerprint_hash: payload.deviceFingerprintHash ?? null
  })

  if (error) {
    if (shouldRegisterFailure(error.message)) {
      registerFailure(rateContext.subjectKey, rateContext.roomKey)
    }
    if (error.message === 'PIN_DISABLED') {
      return {
        statusCode: 403,
        body: JSON.stringify({
          error: 'PIN_DISABLED',
          message: 'This PIN has been disabled. Please request a new PIN.'
        })
      }
    }
    if (error.message === 'TRIAL_LIMIT_REACHED') {
      return {
        statusCode: 402,
        body: JSON.stringify({
          error: 'TRIAL_LIMIT_REACHED',
          message: 'Trial limit reached. Please ask your administrator to subscribe to continue.'
        })
      }
    }
    return { statusCode: 400, body: JSON.stringify({ error: error.message }) }
  }

  registerSuccess(rateContext.subjectKey)

  const voteId = typeof data?.voteId === 'string' ? data.voteId : null
  const submittedAt = typeof data?.submittedAt === 'string' ? data.submittedAt : null
  const orgId = typeof data?.orgId === 'string' ? data.orgId : null
  const orgMode = typeof data?.orgMode === 'string' ? data.orgMode : null
  const stripePriceId = typeof data?.stripePriceId === 'string' ? data.stripePriceId : null
  const trialVotesLimit = typeof data?.trialVotesLimit === 'number' ? data.trialVotesLimit : null
  if (!voteId || !submittedAt) {
    console.error('submitVote missing vote receipt source values', { voteId, submittedAt, slug })
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Vote was submitted but receipt generation failed' })
    }
  }

  let receiptCode: string
  try {
    const receipt = await attachVoteReceipt(voteId, submittedAt)
    receiptCode = receipt.code
  } catch (receiptError) {
    console.error('submitVote receipt generation failed', {
      voteId,
      submittedAt,
      slug,
      error: receiptError instanceof Error ? receiptError.message : String(receiptError)
    })
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Vote was submitted but receipt generation failed' })
    }
  }

  if (orgId && orgMode) {
    const allowance = allowanceFromOrg({
      mode: orgMode,
      stripe_price_id: stripePriceId,
      trial_votes_limit: trialVotesLimit
    })
    const { data: usageData, error: usageError } = await supabaseAdmin.rpc('increment_org_vote_usage', {
      p_org_id: orgId,
      p_allowance: allowance,
      p_overage_rate_cents: OVERAGE_RATE_CENTS
    })

    if (usageError) {
      console.error('submitVote usage increment RPC failed', {
        slug,
        orgId,
        error: usageError.message
      })
    } else {
      const usage = Array.isArray(usageData) ? usageData[0] : usageData
      if ((usage?.overage_votes ?? 0) > 0) {
        console.warn('submitVote overage detected', {
          orgId,
          billingPeriodStart: usage?.billing_period_start ?? null,
          voteCount: usage?.vote_count ?? null,
          overageVotes: usage?.overage_votes ?? 0
        })
      }
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, message: data.message, submittedAt: data.submittedAt, receipt: receiptCode })
  }
}
