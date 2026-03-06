import { FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PublicSiteLayout } from '../components/landing/PublicSiteLayout'
import { getPasswordRecoveryRedirectUrl } from '../lib/auth'
import { supabase } from '../lib/supabase'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Forgot Password – MinistryVote'
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setNotice(null)

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getPasswordRecoveryRedirectUrl('/update-password')
      })
      if (resetError) {
        throw resetError
      }
      setNotice('If an account exists for this email, a reset link has been sent.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PublicSiteLayout>
      <section className="auth-hero-shell">
        <div className="auth-brand-panel glow-hover">
          <p className="auth-kicker">MinistryVote Admin</p>
          <h1 className="auth-display-title">Reset your password</h1>
          <p className="auth-display-copy">
            Enter your email address and we&apos;ll send you a secure link to set a new password.
          </p>
          <div className="auth-brand-points">
            <span>Secure recovery link</span>
            <span>No account disclosure</span>
            <span>Same trusted admin workflow</span>
          </div>
        </div>

        <section className="auth-card auth-card-compact">
          <div className="auth-card-header">
            <h2>Password recovery</h2>
            <p>We’ll email a reset link if an account exists for this address.</p>
          </div>

          <form onSubmit={onSubmit} className="auth-form-grid">
            <label className="auth-field">
              <span>Email</span>
              <input
                className="auth-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@church.org"
                required
              />
            </label>
            <p className="auth-helper-copy">Use the email address associated with your MinistryVote admin account.</p>

            {notice ? <p className="auth-notice auth-notice-success">{notice}</p> : null}
            {error ? <p className="auth-notice auth-notice-error">{error}</p> : null}

            <button className="auth-submit-button" type="submit" disabled={submitting}>
              {submitting ? 'Sending reset link...' : 'Send reset link'}
            </button>
          </form>

          <div className="auth-utility-links">
            <Link to="/admin">Back to login</Link>
            <span>•</span>
            <Link to="/privacy">Privacy Policy</Link>
            <span>•</span>
            <Link to="/terms">Terms of Use</Link>
            <span>•</span>
            <Link to="/contact">Contact</Link>
          </div>
        </section>
      </section>
    </PublicSiteLayout>
  )
}
