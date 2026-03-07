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
      <div className="demo-stage-shell">
        <DemoBanner />
        <section className="vote-card">
          <div className="vote-card-header">
            <p className="vote-kicker">MinistryVote Demo Vote</p>
            <h1 className="vote-title">{demoBallot.title}</h1>
            <p className="muted">{demoBallot.description}</p>
          </div>
          <div className="admin-pill-row" style={{ marginBottom: '1rem', justifyContent: 'center' }}>
            <span className="admin-pill">Incumbent: {demoBallot.incumbentName}</span>
            <span className="admin-pill">{demoMajorityLabel(demoBallot.majorityRule)}</span>
          </div>
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
            <button className="btn btn-primary" type="submit" disabled={submitting || !choiceId}>
              {submitting ? 'Submitting...' : 'Submit Demo Vote'}
            </button>
          </form>
        )}
        </section>
      </div>
    </main>
  )
}
