import { Link } from 'react-router-dom'
import { PublicPageHero } from '../components/landing/PublicPageHero'
import { PublicSiteLayout } from '../components/landing/PublicSiteLayout'
import { DemoBanner } from './DemoBanner'
import { demoBallot } from './ballot'

export function DemoLandingPage() {
  return (
    <PublicSiteLayout>
      <PublicPageHero
        title="MinistryVote Demo"
        subtitle="A simulated voting walkthrough for stakeholder demos, training, projector previews, and product promotion."
      />
      <section className="public-content-shell">
        <DemoBanner />
        <div className="public-support-grid">
          <section className="public-card-surface public-info-panel">
            <p className="public-panel-kicker">Demo Overview</p>
            <h2 className="public-panel-title">Show the product with the same confidence as the live platform.</h2>
            <p className="public-panel-copy">
              This demo uses a static ballot and in-browser state only. No database writes occur, but the flow mirrors
              the real attendee and display experience closely enough for promotion and walkthroughs.
            </p>
            <div className="public-info-points">
              <article className="public-info-point">
                <strong>Ballot</strong>
                <p>{demoBallot.title}</p>
              </article>
              <article className="public-info-point">
                <strong>Majority rule</strong>
                <p>{demoBallot.majorityRule}</p>
              </article>
              <article className="public-info-point">
                <strong>Choices</strong>
                <p>{demoBallot.choices.map((c) => c.label).join(', ')}</p>
              </article>
            </div>
          </section>

          <section className="public-card-surface">
            <div className="public-form-grid">
              <div className="admin-empty-note">
                <strong>Recommended demo flow</strong>
                <p>Open the Display screen on the projector first, then use the Vote screen on a phone or second window to simulate the room experience.</p>
              </div>
              <div className="public-action-row">
                <Link to="/demo/vote">
                  <button className="btn btn-primary" type="button">Open Demo Vote</button>
                </Link>
                <Link to="/demo/display">
                  <button className="btn btn-secondary" type="button">Open Demo Display</button>
                </Link>
              </div>
            </div>
          </section>
        </div>
      </section>
    </PublicSiteLayout>
  )
}
