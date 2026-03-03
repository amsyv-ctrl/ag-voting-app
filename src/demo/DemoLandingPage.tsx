import { Link } from 'react-router-dom'
import { DemoBanner } from './DemoBanner'
import { demoBallot } from './ballot'

export function DemoLandingPage() {
  return (
    <main className="page">
      <DemoBanner />
      <section className="card">
        <h1>AG Voting Demo</h1>
        <p className="muted">
          This demo simulates live voting with no database writes. Use it for training, walkthroughs, and projector previews.
        </p>
        <p><strong>Ballot:</strong> {demoBallot.title}</p>
        <p><strong>Rule:</strong> {demoBallot.majorityRule}</p>
        <p><strong>Choices:</strong> {demoBallot.choices.map((c) => c.label).join(', ')}</p>
        <div className="inline">
          <Link to="/demo/vote">
            <button type="button">Open Demo Vote</button>
          </Link>
          <Link to="/demo/display">
            <button type="button" className="secondary">Open Demo Display</button>
          </Link>
        </div>
      </section>
    </main>
  )
}

