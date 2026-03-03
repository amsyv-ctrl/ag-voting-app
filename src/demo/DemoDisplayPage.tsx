import { useEffect, useMemo, useState } from 'react'
import { DemoBanner } from './DemoBanner'
import { demoBallot } from './ballot'
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

  return (
    <main className="display-page">
      <DemoBanner />
      <section className="display-main">
        <h1 className="display-event">AG Voting Demo</h1>
        <h2 className="display-ballot-title">{demoBallot.title}</h2>
        <p className="display-status">Total Votes: {state.total}</p>
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
    </main>
  )
}

