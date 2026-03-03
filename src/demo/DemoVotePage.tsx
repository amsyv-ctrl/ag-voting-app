import { FormEvent, useEffect, useState } from 'react'
import { DemoBanner } from './DemoBanner'
import { demoBallot, demoMajorityLabel } from './ballot'
import { submitDemoVote } from './store'

const RESET_MS = 1500

export function DemoVotePage() {
  const [choiceId, setChoiceId] = useState(demoBallot.choices[0]?.id ?? '')
  const [confirmation, setConfirmation] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!confirmation) return
    const timer = window.setTimeout(() => {
      setConfirmation(false)
      setChoiceId(demoBallot.choices[0]?.id ?? '')
    }, RESET_MS)
    return () => window.clearTimeout(timer)
  }, [confirmation])

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!choiceId) return
    setSubmitting(true)
    submitDemoVote(choiceId)
    setConfirmation(true)
    setSubmitting(false)
  }

  return (
    <main className="vote-page">
      <DemoBanner />
      <section className="vote-card">
        <h1 className="vote-title">{demoBallot.title}</h1>
        <p className="vote-description">{demoBallot.description}</p>
        <p className="vote-info">Incumbent: {demoBallot.incumbentName}</p>
        <p className="vote-info">Threshold: {demoMajorityLabel(demoBallot.majorityRule)}</p>
        {confirmation ? (
          <div className="success-box">
            <h2>Vote received</h2>
            <p>Resetting for the next voter...</p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="stack">
            <fieldset className="vote-options" disabled={submitting}>
              <legend>Choose one</legend>
              {demoBallot.choices.map((choice) => (
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
            <button type="submit" disabled={submitting || !choiceId}>
              {submitting ? 'Submitting...' : 'Submit Demo Vote'}
            </button>
          </form>
        )}
      </section>
    </main>
  )
}
