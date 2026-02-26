import type { BallotResults, PublicBallot } from '../types'

const API_BASE = '/api'

async function handleJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message = typeof data?.error === 'string' ? data.error : 'Request failed'
    throw new Error(message)
  }
  return data as T
}

export async function fetchBallotPublic(slug: string): Promise<PublicBallot> {
  const res = await fetch(`${API_BASE}/getBallotPublic?slug=${encodeURIComponent(slug)}`)
  return handleJson<PublicBallot>(res)
}

export async function submitVote(payload: {
  slug: string
  pin: string
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
