type Entry = {
  attempts: number
  blockedUntil: number
  firstAt: number
}

type ScopeConfig = {
  windowMs: number
  maxAttempts: number
  blockMs: number
}

const subjectEntries = new Map<string, Entry>()
const roomEntries = new Map<string, Entry>()

// Subject scope targets a repeated bad actor or repeated bad PIN/device pattern.
const SUBJECT_SCOPE: ScopeConfig = {
  windowMs: 5 * 60 * 1000,
  maxAttempts: 12,
  blockMs: 5 * 60 * 1000
}

// Room scope is intentionally much looser so a conference room behind one NAT
// does not get blocked because a handful of delegates mistype their PINs.
const ROOM_SCOPE: ScopeConfig = {
  windowMs: 60 * 1000,
  maxAttempts: 200,
  blockMs: 20 * 1000
}

function checkEntry(store: Map<string, Entry>, key: string, config: ScopeConfig) {
  const now = Date.now()
  const current = store.get(key)

  if (!current) {
    store.set(key, { attempts: 0, blockedUntil: 0, firstAt: now })
    return { blocked: false, retryAfter: 0 }
  }

  if (current.blockedUntil > now) {
    return { blocked: true, retryAfter: Math.ceil((current.blockedUntil - now) / 1000) }
  }

  if (now - current.firstAt > config.windowMs) {
    store.set(key, { attempts: 0, blockedUntil: 0, firstAt: now })
  }

  return { blocked: false, retryAfter: 0 }
}

function bumpFailure(store: Map<string, Entry>, key: string, config: ScopeConfig) {
  const now = Date.now()
  const current = store.get(key) ?? { attempts: 0, blockedUntil: 0, firstAt: now }

  if (now - current.firstAt > config.windowMs) {
    current.attempts = 0
    current.firstAt = now
    current.blockedUntil = 0
  }

  current.attempts += 1
  if (current.attempts >= config.maxAttempts) {
    current.blockedUntil = now + config.blockMs
    current.attempts = 0
    current.firstAt = now
  }

  store.set(key, current)
}

export function checkLimit(subjectKey: string, roomKey: string) {
  const subject = checkEntry(subjectEntries, subjectKey, SUBJECT_SCOPE)
  if (subject.blocked) return subject
  return checkEntry(roomEntries, roomKey, ROOM_SCOPE)
}

export function registerFailure(subjectKey: string, roomKey: string) {
  bumpFailure(subjectEntries, subjectKey, SUBJECT_SCOPE)
  bumpFailure(roomEntries, roomKey, ROOM_SCOPE)
}

export function registerSuccess(subjectKey: string) {
  subjectEntries.delete(subjectKey)
}
