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
}): Promise<{ message: string; submittedAt: string }> {
  const res = await fetch(`${API_BASE}/submitVote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  return handleJson<{ message: string; submittedAt: string }>(res)
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

export type OrgBootstrapResponse = {
  org: {
    id: string
    name: string
    mode: 'DEMO' | 'TRIAL' | 'PAID'
    trial_event_id: string | null
    trial_votes_used: number
    trial_votes_limit: number
    subscription_status: string | null
    current_period_end: string | null
    is_active: boolean
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
