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
    signup_role: string | null
    estimated_voting_size: string | null
    organization_type: string | null
    country: string | null
    address_line1: string | null
    address_line2: string | null
    city: string | null
    state_region: string | null
    postal_code: string | null
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

export type SuperAdminDashboardResponse = {
  summary: {
    total_organizations: number
    paid_active_organizations: number
    trial_organizations: number
    inactive_canceled_organizations: number
    total_events: number
    total_ballots: number
    total_votes_cast: number
  }
  charts: {
    subscription_status: Record<string, number>
    organization_type: Record<string, number>
    estimated_voting_size: Record<string, number>
  }
  recent_signups: Array<{
    org_id: string
    org_name: string
    created_at: string
    mode: string
    organization_type: string | null
  }>
  recent_subscriptions: Array<{
    org_id: string
    org_name: string
    subscription_status: string | null
    current_period_end: string | null
  }>
  upcoming_events: Array<{
    org_name: string
    event_name: string
    date: string | null
    location: string | null
  }>
  top_organizations_by_vote_count: Array<{
    org_id: string
    org_name: string
    total_votes_cast: number
  }>
  billing_issues: Array<{
    org_id: string
    org_name: string
    issue: string
    subscription_status: string | null
    current_period_end: string | null
  }>
  usage_warnings: Array<{
    org_id: string
    org_name: string
    plan_name: string
    votes_used: number
    allowance: number
    overage_votes: number
    estimated_overage_cents: number
    warning_80: boolean
    in_overage: boolean
  }>
  trial_funnel: {
    trial_orgs_total: number
    trial_orgs_with_event: number
    trial_orgs_with_ballot: number
    trial_orgs_with_vote: number
    trial_orgs_converted_to_paid: number
  }
}

export async function getSuperAdminDashboard(accessToken: string): Promise<SuperAdminDashboardResponse> {
  const res = await fetch(`${API_BASE}/getSuperAdminDashboard`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  return handleJson<SuperAdminDashboardResponse>(res)
}

export type SuperAdminOrgDetailResponse = {
  org: {
    id: string
    name: string
    mode: 'DEMO' | 'TRIAL' | 'PAID'
    is_active: boolean
    subscription_status: string | null
    current_period_end: string | null
    stripe_customer_id: string | null
    stripe_subscription_id: string | null
    stripe_price_id: string | null
    organization_type: string | null
    estimated_voting_size: string | null
    trial_votes_limit: number | null
    internal_notes: string | null
  }
  stats: {
    total_events: number
    total_ballots: number
    total_votes_cast: number
    plan_name: string
    allowance: number
    votes_used: number
    overage_votes: number
    estimated_overage_cents: number
  }
  recent_activity: Array<{
    action: string
    created_at: string
    event_id: string | null
    ballot_id: string | null
    metadata: Record<string, unknown> | null
    actor_user_id: string | null
  }>
  upcoming_events: Array<{
    id: string
    name: string
    date: string | null
    location: string | null
    org_id: string
  }>
}

export async function getSuperAdminOrgDetail(accessToken: string, orgId: string): Promise<SuperAdminOrgDetailResponse> {
  const res = await fetch(`${API_BASE}/getSuperAdminOrgDetail?orgId=${encodeURIComponent(orgId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  return handleJson<SuperAdminOrgDetailResponse>(res)
}

export async function superAdminUpdateOrg(
  accessToken: string,
  payload: {
    orgId: string
    mode: 'TRIAL' | 'PAID' | 'INACTIVE'
    is_active: boolean
    current_period_end: string | null
    trial_votes_limit: number | null
    internal_notes: string | null
  }
): Promise<{ ok: boolean; org: { mode: string; is_active: boolean; current_period_end: string | null; trial_votes_limit: number | null; internal_notes: string | null } }> {
  const res = await fetch(`${API_BASE}/superAdminUpdateOrg`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  return handleJson<{ ok: boolean; org: { mode: string; is_active: boolean; current_period_end: string | null; trial_votes_limit: number | null; internal_notes: string | null } }>(res)
}
