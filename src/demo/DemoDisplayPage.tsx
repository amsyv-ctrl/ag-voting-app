import { useEffect, useMemo, useState } from 'react'
import { DemoBanner } from './DemoBanner'
import { demoBallot, demoMajorityLabel } from './ballot'
import { getDemoState, subscribeDemoState } from './store'

export function DemoDisplayPage() {
  const [state, setState] = useState(getDemoState())

  useEffect(() => {
    return subscribeDemoState(() => {
      setState(getDemoState())
    })
  }, [])

  const rows = useMemo(() => {
    return demoBallot.choices
      .map((choice) => {
        const votes = state.counts[choice.id] ?? 0
        const pct = state.total > 0 ? votes / state.total : 0
        return { ...choice, votes, pct }
      })
      .sort((a, b) => b.votes - a.votes)
  }, [state])

  const winner = useMemo(() => {
    if (state.total === 0) return null
    const sorted = [...rows].sort((a, b) => b.votes - a.votes)
    const top = sorted[0]
    const second = sorted[1]
    if (!top) return null
    if (second && top.votes === second.votes) return null

    if (demoBallot.majorityRule === 'TWO_THIRDS') {
      return top.votes * 3 >= state.total * 2 ? top : null
    }
    return top.votes * 2 > state.total ? top : null
  }, [rows, state.total])

  return (
    <main className="display-page">
      <div className="demo-stage-shell">
        <DemoBanner />
        <section className="display-grid">
          <section className="display-main">
            <p className="vote-kicker">MinistryVote Demo Display</p>
            <h1 className="display-event">MinistryVote Demo</h1>
            <h2 className="display-ballot-title">{demoBallot.title}</h2>
            <div className="display-meta-grid">
              <p className="display-meta-pill">Incumbent: {demoBallot.incumbentName}</p>
              <p className="display-meta-pill">{demoMajorityLabel(demoBallot.majorityRule)}</p>
              <p className="display-meta-pill">Total Votes: {state.total}</p>
            </div>
            {winner ? (
              <div className="display-winner-wrap">
                <p className="display-winner-kicker">Demo Winner (threshold met)</p>
                <p className="display-winner-name">{winner.label}</p>
              </div>
            ) : (
              <p className="display-threshold">
                {demoBallot.majorityRule === 'TWO_THIRDS'
                  ? 'Winner requires 2/3 majority; otherwise runoff required.'
                  : 'Winner requires simple majority; otherwise runoff required.'}
              </p>
            )}
            <div className="display-results">
              {rows.map((row) => (
                <div key={row.id} className="display-bar-container">
                  <div className="display-bar-label">
                    <span>{row.label}</span>
                    <span>{row.votes} votes ({(row.pct * 100).toFixed(1)}%)</span>
                  </div>
                  <div className="display-bar-track">
                    <div className="display-bar-fill" style={{ width: `${row.pct * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="display-qr-section">
            <h2>Demo Mode</h2>
            <p className="display-hidden-note">Votes are simulated in-browser and are not stored.</p>
            <p className="display-vote-url">Use the Demo Vote screen to submit sample votes.</p>
          </section>
        </section>
      </div>
    </main>
  )
}
