import type { BallotResults, PublicBallot } from '../types'

const API_BASE = '/api'

export class ApiError extends Error {
  code: string | null
  status: number

  constructor(message: string, status: number, code: string | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function handleJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const code = typeof data?.error === 'string' ? data.error : null
    const message =
      typeof data?.message === 'string'
        ? data.message
        : typeof data?.error === 'string'
          ? data.error
          : 'Request failed'
    throw new ApiError(message, res.status, code)
  }
  return data as T
}

export async function fetchBallotPublic(slug: string): Promise<PublicBallot> {
  const res = await fetch(`${API_BASE}/getBallotPublic?slug=${encodeURIComponent(slug)}`)
  return handleJson<PublicBallot>(res)
}

export async function submitVote(payload: {
  slug: string
  pin?: string
  choiceId: string
}): Promise<{ ok: boolean; message: string; submittedAt: string; receipt: string }> {
  const res = await fetch(`${API_BASE}/submitVote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  return handleJson<{ ok: boolean; message: string; submittedAt: string; receipt: string }>(res)
}

export async function fetchBallotResults(slug: string): Promise<BallotResults> {
  const res = await fetch(`${API_BASE}/getBallotPublic?slug=${encodeURIComponent(slug)}&results=1`)
  return handleJson<BallotResults>(res)
}

export async function adminGeneratePins(
  accessToken: string,
  eventId: string,
  count: number
): Promise<{ generated: string[]; total: number }> {
  const res = await fetch(`${API_BASE}/adminGeneratePins`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ eventId, count })
  })

  return handleJson<{ generated: string[]; total: number }>(res)
}

export async function disablePinByCode(
  accessToken: string,
  eventId: string,
  pin: string
): Promise<{ ok: boolean; pin: string; alreadyDisabled: boolean }> {
  const res = await fetch(`${API_BASE}/disablePin`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ eventId, pin })
  })

  return handleJson<{ ok: boolean; pin: string; alreadyDisabled: boolean }>(res)
}

export async function exportPinsCsv(
  accessToken: string,
  eventId: string
): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`${API_BASE}/exportPinsCsv`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ eventId })
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const code = typeof data?.error === 'string' ? data.error : null
    const message =
      typeof data?.message === 'string'
        ? data.message
        : typeof data?.error === 'string'
          ? data.error
          : 'Request failed'
    throw new ApiError(message, res.status, code)
  }

  const disposition = res.headers.get('content-disposition') || ''
  const match = disposition.match(/filename=\"?([^\";]+)\"?/)
  const filename = match?.[1] || `event_pins_${eventId}.csv`
  const blob = await res.blob()
  return { blob, filename }
}

export type OrgBootstrapResponse = {
  org: {
    id: string
    name: string
    mode: 'DEMO' | 'TRIAL' | 'PAID'
    stripe_customer_id: string | null
    stripe_price_id: string | null
    trial_event_id: string | null
    trial_votes_used: number
    trial_votes_limit: number
    subscription_status: string | null
    current_period_end: string | null
    is_active: boolean
  }
  usage: {
    plan_name: 'STARTER' | 'GROWTH' | 'NETWORK' | 'TRIAL' | 'UNKNOWN'
    billing_period_start: string | null
    votes_used: number
    allowance: number
    remaining: number
    overage_votes: number
    estimated_overage_cents: number
    warning_80: boolean
  }
  role: 'OWNER' | 'ADMIN' | 'STAFF'
  created: boolean
}

export async function bootstrapOrg(accessToken: string): Promise<OrgBootstrapResponse> {
  const res = await fetch(`${API_BASE}/bootstrapOrg`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  })

  return handleJson<OrgBootstrapResponse>(res)
}

export async function createTrialEvent(accessToken: string): Promise<{ eventId: string; slug: string | null }> {
  const res = await fetch(`${API_BASE}/createTrialEvent`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  })

  return handleJson<{ eventId: string; slug: string | null }>(res)
}

export async function createCheckoutSession(
  accessToken: string,
  plan: 'STARTER' | 'GROWTH' | 'NETWORK'
): Promise<{ url: string }> {
  const res = await fetch(`${API_BASE}/createCheckoutSession`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ plan })
  })

  return handleJson<{ url: string }>(res)
}

export async function createPortalSession(accessToken: string): Promise<{ url: string }> {
  const res = await fetch(`${API_BASE}/createPortalSession`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  })

  return handleJson<{ url: string }>(res)
}

export async function archiveEvent(
  accessToken: string,
  eventId: string
): Promise<{ ok: boolean; eventId: string; closedOpenBallots: number }> {
  const res = await fetch(`${API_BASE}/archiveEvent`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ eventId })
  })

  return handleJson<{ ok: boolean; eventId: string; closedOpenBallots: number }>(res)
}

export async function verifyReceipt(
  accessToken: string,
  receiptCode: string
): Promise<{
  found: boolean
  ballot_id?: string
  event_id?: string
  round?: number
  created_at?: string
}> {
  const res = await fetch(`${API_BASE}/verifyReceipt`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ receipt_code: receiptCode })
  })

  return handleJson<{
    found: boolean
    ballot_id?: string
    event_id?: string
    round?: number
    created_at?: string
  }>(res)
}

export async function sealBallotRound(
  accessToken: string,
  ballotId: string,
  round: number
): Promise<{ seal_short: string; seal_hash: string; total_votes: number }> {
  const res = await fetch(`${API_BASE}/sealBallotRound`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ballot_id: ballotId, round })
  })

  return handleJson<{ seal_short: string; seal_hash: string; total_votes: number }>(res)
}

export async function logElectionAudit(
  accessToken: string,
  payload: {
    action: string
    event_id?: string | null
    ballot_id?: string | null
    metadata?: Record<string, unknown>
  }
): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/logElectionAudit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  return handleJson<{ ok: boolean }>(res)
}
