type Entry = {
  attempts: number
  blockedUntil: number
  firstAt: number
}

const entries = new Map<string, Entry>()
const WINDOW_MS = 2 * 60 * 1000
const MAX_ATTEMPTS = 8
const BLOCK_MS = 60 * 1000

export function checkLimit(key: string) {
  const now = Date.now()
  const current = entries.get(key)

  if (!current) {
    entries.set(key, { attempts: 0, blockedUntil: 0, firstAt: now })
    return { blocked: false, retryAfter: 0 }
  }

  if (current.blockedUntil > now) {
    return { blocked: true, retryAfter: Math.ceil((current.blockedUntil - now) / 1000) }
  }

  if (now - current.firstAt > WINDOW_MS) {
    entries.set(key, { attempts: 0, blockedUntil: 0, firstAt: now })
  }

  return { blocked: false, retryAfter: 0 }
}

export function registerFailure(key: string) {
  const now = Date.now()
  const current = entries.get(key) ?? { attempts: 0, blockedUntil: 0, firstAt: now }

  if (now - current.firstAt > WINDOW_MS) {
    current.attempts = 0
    current.firstAt = now
    current.blockedUntil = 0
  }

  current.attempts += 1
  if (current.attempts >= MAX_ATTEMPTS) {
    current.blockedUntil = now + BLOCK_MS
    current.attempts = 0
    current.firstAt = now
  }

  entries.set(key, current)
}

export function registerSuccess(key: string) {
  entries.delete(key)
}
