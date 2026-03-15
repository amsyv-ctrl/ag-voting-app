#!/usr/bin/env node

const targetUrl = process.env.TARGET_URL || 'http://localhost:8888/.netlify/functions/submitVote'
const slug = process.env.BALLOT_SLUG
const choiceId = process.env.CHOICE_ID
const totalVotes = Number.parseInt(process.env.TOTAL_VOTES || '500', 10)
const invalidPercent = Number.parseFloat(process.env.INVALID_PERCENT || '0.04')
const concurrency = Number.parseInt(process.env.CONCURRENCY || '100', 10)
const validPins = (process.env.VALID_PINS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

if (!slug || !choiceId) {
  console.error('Missing BALLOT_SLUG or CHOICE_ID.')
  process.exit(1)
}

if (validPins.length === 0) {
  console.error('Provide VALID_PINS as a comma-separated list of real event PINs for the ballot event.')
  process.exit(1)
}

function makeInvalidPin(index) {
  return String((9000 + (index % 999)).toString()).padStart(4, '0')
}

function buildPayload(index) {
  const isInvalid = Math.random() < invalidPercent
  return {
    slug,
    choiceId,
    pin: isInvalid ? makeInvalidPin(index) : validPins[index % validPins.length],
    deviceFingerprintHash: `loadtest-device-${index}`
  }
}

async function submitOne(index) {
  const startedAt = Date.now()
  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(index))
    })
    const body = await res.json().catch(() => ({}))
    return {
      ok: res.ok,
      status: res.status,
      durationMs: Date.now() - startedAt,
      error: typeof body?.error === 'string' ? body.error : null,
      message: typeof body?.message === 'string' ? body.message : null
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      durationMs: Date.now() - startedAt,
      error: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : String(error)
    }
  }
}

async function runPool() {
  const outcomes = []
  let nextIndex = 0

  async function worker() {
    while (nextIndex < totalVotes) {
      const currentIndex = nextIndex
      nextIndex += 1
      outcomes.push(await submitOne(currentIndex))
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, totalVotes) }, () => worker()))
  return outcomes
}

function summarize(outcomes) {
  const byStatus = new Map()
  const byError = new Map()
  const durations = outcomes.map((item) => item.durationMs).sort((a, b) => a - b)

  for (const item of outcomes) {
    byStatus.set(item.status, (byStatus.get(item.status) || 0) + 1)
    if (item.error) byError.set(item.error, (byError.get(item.error) || 0) + 1)
  }

  const percentile = (p) => {
    if (durations.length === 0) return 0
    const index = Math.min(durations.length - 1, Math.floor((p / 100) * durations.length))
    return durations[index]
  }

  return {
    total: outcomes.length,
    ok: outcomes.filter((item) => item.ok).length,
    appErrors: outcomes.filter((item) => item.status >= 400).length,
    networkOrEdgeErrors: outcomes.filter((item) => item.status === 0 || item.status === 403 || item.status === 429 || item.error === 'NETWORK_ERROR').length,
    statusCounts: Object.fromEntries(byStatus.entries()),
    errorCounts: Object.fromEntries(byError.entries()),
    latencyMs: {
      p50: percentile(50),
      p90: percentile(90),
      p95: percentile(95),
      p99: percentile(99),
      max: durations[durations.length - 1] || 0
    }
  }
}

const started = Date.now()
const outcomes = await runPool()
const summary = summarize(outcomes)

console.log(JSON.stringify({
  targetUrl,
  totalVotes,
  concurrency,
  invalidPercent,
  durationSeconds: ((Date.now() - started) / 1000).toFixed(2),
  summary
}, null, 2))
