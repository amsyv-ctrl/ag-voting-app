import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ApiError, fetchBallotPublic, submitVote } from '../lib/api'
import { roundLabel } from '../lib/roundLabel'
import type { PublicBallot } from '../types'

const SUCCESS_RESET_SECONDS = 10

export function VotePage() {
  const { slug } = useParams()
  const ballotSlug = slug as string

  const [ballot, setBallot] = useState<PublicBallot | null>(null)
  const [pin, setPin] = useState('')
  const [choiceId, setChoiceId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmation, setConfirmation] = useState<{ message: string; submittedAt: string; receipt: string } | null>(null)
  const [trialLimitReached, setTrialLimitReached] = useState(false)
  const [secondsRemaining, setSecondsRemaining] = useState(SUCCESS_RESET_SECONDS)
  const [copied, setCopied] = useState(false)
  const canUseClipboard = typeof navigator !== 'undefined' && !!navigator.clipboard?.writeText

  function resetForNextVoter() {
    setPin('')
    setChoiceId(ballot?.choices?.[0]?.id ?? '')
    setConfirmation(null)
    setError(null)
    setSecondsRemaining(SUCCESS_RESET_SECONDS)
    setCopied(false)
  }

  useEffect(() => {
    fetchBallotPublic(ballotSlug)
      .then((data) => {
        setBallot(data)
        if (data.choices[0]) {
          setChoiceId(data.choices[0].id)
        }
      })
      .catch((err: Error) => setError(err.message))
  }, [ballotSlug])

  useEffect(() => {
    if (!confirmation) return
    setSecondsRemaining(SUCCESS_RESET_SECONDS)
    const timer = window.setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer)
          resetForNextVoter()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => window.clearInterval(timer)
  }, [confirmation, ballot?.choices])

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1200)
    return () => window.clearTimeout(timer)
  }, [copied])

  const isClosed = useMemo(() => {
    if (!ballot) return false
    return ballot.status !== 'OPEN'
  }, [ballot])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!ballot) return
    setError(null)
    setTrialLimitReached(false)
    setSubmitting(true)

    try {
      const result = await submitVote({
        slug: ballotSlug,
        pin: ballot.requires_pin ? pin : undefined,
        choiceId
      })
      setConfirmation(result)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TRIAL_LIMIT_REACHED') {
        setTrialLimitReached(true)
      }
      setError(err instanceof Error ? err.message : 'Failed to submit vote')
    } finally {
      setSubmitting(false)
    }
  }

  async function onCopyReceipt() {
    if (!confirmation || !canUseClipboard) return
    try {
      await navigator.clipboard.writeText(confirmation.receipt)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  if (!ballot) {
    return <main className="vote-page"><div className="vote-card">Loading ballot...</div></main>
  }

  return (
    <main className="vote-page">
      <section className="vote-card">
        <h1 className="vote-title">Cast Your Vote</h1>
        <p className="vote-info">Current Vote: #{Math.max(1, ballot.vote_round || 1)}</p>
        <p className="vote-info">Event: {ballot.event_name}</p>
        <p className="vote-info">Ballot: {ballot.title}</p>
        {ballot.incumbent_name && <p className="vote-info">Incumbent: {ballot.incumbent_name}</p>}
        <p className="vote-info">Round Label: {roundLabel(ballot.vote_round)} vote</p>
        <p className="vote-info">PIN Required: {ballot.requires_pin ? 'Yes' : 'No'}</p>
        {ballot.description && <p className="vote-description">{ballot.description}</p>}

        {confirmation ? (
          <div className="success-box">
            <h2>Vote received</h2>
            <p className="vote-receipt-line">
              <strong>Receipt:</strong>{' '}
              <span className="vote-receipt-code">{confirmation.receipt}</span>
            </p>
            <p className="muted">Please note your receipt before continuing.</p>
            <div className="inline">
              {canUseClipboard && (
                <button type="button" className="secondary" onClick={onCopyReceipt}>
                  Copy
                </button>
              )}
              {copied && <span className="muted">Copied!</span>}
              <button type="button" onClick={resetForNextVoter}>Done / Next voter</button>
            </div>
            <p className="muted">Auto-resetting in {secondsRemaining}s...</p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="stack">
            {ballot.requires_pin && (
              <label className="vote-pin-label">
                Enter PIN
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  minLength={4}
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="0000"
                  disabled={submitting || isClosed}
                  required
                />
              </label>
            )}

            <fieldset className="vote-options" disabled={submitting || isClosed || trialLimitReached}>
              <legend>Choose one</legend>
              {ballot.choices.map((choice) => (
                <label key={choice.id} className="radio-row">
                  <input
                    type="radio"
                    name="choice"
                    value={choice.id}
                    checked={choiceId === choice.id}
                    onChange={(e) => setChoiceId(e.target.value)}
                  />
                  {choice.label}
                </label>
              ))}
            </fieldset>

            <button
              type="submit"
              disabled={submitting || isClosed || trialLimitReached || (ballot.requires_pin && pin.length !== 4) || !choiceId}
            >
              {submitting ? 'Submitting...' : 'Submit Vote'}
            </button>
          </form>
        )}

        {isClosed && <p className="error">This ballot is currently closed for voting.</p>}
        {trialLimitReached && (
          <p className="error">Trial limit reached. Please ask your administrator to subscribe to continue.</p>
        )}
        {error && !trialLimitReached && <p className="error">{error}</p>}
      </section>
    </main>
  )
}
