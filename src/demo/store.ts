import { demoBallot } from './ballot'

type DemoVoteEvent = {
  id: string
  choiceId: string
  ts: number
}

export type DemoState = {
  counts: Record<string, number>
  total: number
  updatedAt: number
}

const CHANNEL = 'agvoting-demo'
const EVENT_KEY = 'agvoting-demo-event'
const STATE_KEY = 'agvoting-demo-state'

function emptyCounts() {
  const counts: Record<string, number> = {}
  for (const choice of demoBallot.choices) counts[choice.id] = 0
  return counts
}

function defaultState(): DemoState {
  return {
    counts: emptyCounts(),
    total: 0,
    updatedAt: Date.now()
  }
}

function readState(): DemoState {
  if (typeof window === 'undefined') return defaultState()
  try {
    const raw = window.localStorage.getItem(STATE_KEY)
    if (!raw) return defaultState()
    const parsed = JSON.parse(raw) as DemoState
    const normalized = defaultState()
    for (const choice of demoBallot.choices) {
      normalized.counts[choice.id] = Math.max(0, Number(parsed?.counts?.[choice.id] ?? 0))
    }
    normalized.total = demoBallot.choices.reduce((sum, c) => sum + normalized.counts[c.id], 0)
    normalized.updatedAt = Number(parsed?.updatedAt ?? Date.now())
    return normalized
  } catch {
    return defaultState()
  }
}

let state: DemoState = readState()
const listeners = new Set<() => void>()
const processed = new Set<string>()
let broadcast: BroadcastChannel | null = null

function persist() {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STATE_KEY, JSON.stringify(state))
}

function emit() {
  for (const cb of listeners) cb()
}

function applyEvent(evt: DemoVoteEvent) {
  if (processed.has(evt.id)) return
  processed.add(evt.id)
  if (!(evt.choiceId in state.counts)) return
  state = {
    counts: {
      ...state.counts,
      [evt.choiceId]: state.counts[evt.choiceId] + 1
    },
    total: state.total + 1,
    updatedAt: evt.ts
  }
  persist()
  emit()
}

function initSync() {
  if (typeof window === 'undefined') return
  if (typeof BroadcastChannel !== 'undefined') {
    broadcast = new BroadcastChannel(CHANNEL)
    broadcast.onmessage = (message: MessageEvent<DemoVoteEvent>) => {
      if (message?.data?.id) applyEvent(message.data)
    }
  }

  window.addEventListener('storage', (ev) => {
    if (ev.key !== EVENT_KEY || !ev.newValue) return
    try {
      const parsed = JSON.parse(ev.newValue) as DemoVoteEvent
      if (parsed?.id) applyEvent(parsed)
    } catch {
      // noop
    }
  })
}

initSync()

export function getDemoState() {
  return state
}

export function submitDemoVote(choiceId: string) {
  const evt: DemoVoteEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    choiceId,
    ts: Date.now()
  }

  applyEvent(evt)

  if (broadcast) {
    broadcast.postMessage(evt)
  }

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(EVENT_KEY, JSON.stringify(evt))
  }
}

export function subscribeDemoState(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

