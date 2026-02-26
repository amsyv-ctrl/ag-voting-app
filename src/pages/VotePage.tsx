import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchBallotPublic, submitVote } from '../lib/api'
import type { PublicBallot } from '../types'

const RESET_MS = 3000

export function VotePage() {
  const { slug } = useParams()
  const ballotSlug = slug as string

  const [ballot, setBallot] = useState<PublicBallot | null>(null)
  const [pin, setPin] = useState('')
  const [choiceId, setChoiceId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmation, setConfirmation] = useState<{ message: string; submittedAt: string } | null>(null)

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
    const timer = window.setTimeout(() => {
      setPin('')
      setChoiceId(ballot?.choices?.[0]?.id ?? '')
      setConfirmation(null)
      setError(null)
    }, RESET_MS)

    return () => window.clearTimeout(timer)
  }, [confirmation, ballot?.choices])

  const isClosed = useMemo(() => {
    if (!ballot) return false
    return ballot.status !== 'OPEN'
  }, [ballot])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const result = await submitVote({ slug: ballotSlug, pin, choiceId })
      setConfirmation(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit vote')
    } finally {
      setSubmitting(false)
    }
  }

  if (!ballot) {
    return <main className="vote-page"><div className="vote-card">Loading ballot...</div></main>
  }

  return (
    <main className="vote-page">
      <section className="vote-card">
        <h1>{ballot.title}</h1>
        {ballot.description && <p>{ballot.description}</p>}

        {confirmation ? (
          <div className="success-box">
            <h2>Vote received</h2>
            <p>{new Date(confirmation.submittedAt).toLocaleString()}</p>
            <p>Resetting for the next voter...</p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="stack">
            <label>
              4-digit PIN
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

            <fieldset disabled={submitting || isClosed}>
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

            <button type="submit" disabled={submitting || isClosed || pin.length !== 4 || !choiceId}>
              {submitting ? 'Submitting...' : 'Submit Vote'}
            </button>
          </form>
        )}

        {isClosed && <p className="error">This ballot is currently closed.</p>}
        {error && <p className="error">{error}</p>}
      </section>
    </main>
  )
}
