import { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { PublicPageHero } from '../components/landing/PublicPageHero'
import { PublicSiteLayout } from '../components/landing/PublicSiteLayout'
import { submitContactForm } from '../lib/api'

export function ContactPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [organization, setOrganization] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setSuccess(null)
    setError(null)

    try {
      await submitContactForm({ name, email, organization, message })
      setSuccess('Message sent. We’ll get back to you within 2–3 business days.')
      setName('')
      setEmail('')
      setOrganization('')
      setMessage('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PublicSiteLayout>
      <PublicPageHero
        title="Contact Us"
        subtitle="Have a question about MinistryVote or want help thinking through your voting setup? Send us a message and we’ll get back to you. Responses typically within 2–3 business days."
      />

      <section className="public-content-shell">
        <div className="public-support-grid">
          <section className="public-card-surface public-info-panel">
            <p className="public-panel-kicker">Support</p>
            <h2 className="public-panel-title">Reach out with setup, workflow, or product questions.</h2>
            <p className="public-panel-copy">
              MinistryVote is built for real governance voting. If you want help thinking through events, ballots,
              PIN workflow, or rollout for your team, use this form and we’ll respond as capacity allows.
            </p>
            <div className="public-info-points">
              <article className="public-info-point">
                <strong>Response window</strong>
                <p>Most responses go out within 2–3 business days.</p>
              </article>
              <article className="public-info-point">
                <strong>Best use</strong>
                <p>Questions about setup, subscription, voting workflow, or governance use cases.</p>
              </article>
              <article className="public-info-point">
                <strong>Helpful context</strong>
                <p>Include your organization name and a short description of what kind of meeting or vote you are planning.</p>
              </article>
            </div>
          </section>

          <section className="public-card-surface">
        <form onSubmit={onSubmit} className="public-form-grid">
          <label className="public-field">
            <span>Name</span>
            <input className="public-input" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="public-field">
            <span>Email</span>
            <input className="public-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="public-field">
            <span>Organization</span>
            <input className="public-input" value={organization} onChange={(e) => setOrganization(e.target.value)} />
          </label>
          <label className="public-field">
            <span>Message</span>
            <textarea className="public-textarea" value={message} onChange={(e) => setMessage(e.target.value)} required />
          </label>

          {success ? <p className="auth-notice auth-notice-success">{success}</p> : null}
          {error ? <p className="auth-notice auth-notice-error">{error}</p> : null}

          <div className="public-action-row">
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Sending...' : 'Send Message'}
            </button>
            <Link to="/" className="public-secondary-link">Back to Home</Link>
          </div>
        </form>
          </section>
        </div>
      </section>
    </PublicSiteLayout>
  )
}
