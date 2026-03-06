import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PublicSiteLayout } from '../components/landing/PublicSiteLayout'
import { supabase } from '../lib/supabase'

const MIN_PASSWORD_LENGTH = 8

export function UpdatePasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [ready, setReady] = useState(false)
  const [validRecovery, setValidRecovery] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Update Password – MinistryVote'
  }, [])

  useEffect(() => {
    let mounted = true

    async function initializeRecovery() {
      const { data, error: sessionError } = await supabase.auth.getSession()
      if (!mounted) return

      if (sessionError) {
        setError('This password reset link is invalid or expired.')
        setReady(true)
        return
      }

      if (data.session) {
        setValidRecovery(true)
        setReady(true)
        return
      }

      const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
        if (!mounted) return
        if (event === 'PASSWORD_RECOVERY' || session) {
          setValidRecovery(true)
          setError(null)
        }
        setReady(true)
      })

      window.setTimeout(() => {
        if (!mounted) return
        setReady(true)
      }, 600)

      return () => {
        listener.subscription.unsubscribe()
      }
    }

    const cleanupPromise = initializeRecovery()

    return () => {
      mounted = false
      void cleanupPromise?.then((cleanup) => cleanup?.())
    }
  }, [])

  const passwordError = useMemo(() => {
    if (!password && !confirmPassword) return null
    if (password.length < MIN_PASSWORD_LENGTH) {
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
    }
    if (password !== confirmPassword) {
      return 'Passwords do not match.'
    }
    return null
  }, [password, confirmPassword])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (passwordError) {
      setError(passwordError)
      return
    }

    setSubmitting(true)
    setError(null)
    setNotice(null)

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        throw updateError
      }
      setNotice('Your password has been updated. You can now sign in with your new password.')
      setPassword('')
      setConfirmPassword('')
      await supabase.auth.signOut()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your password. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PublicSiteLayout>
      <section className="auth-hero-shell">
        <div className="auth-brand-panel glow-hover">
          <p className="auth-kicker">MinistryVote Admin</p>
          <h1 className="auth-display-title">Choose a new password</h1>
          <p className="auth-display-copy">
            Set a secure password for your MinistryVote admin account and return to your event dashboard.
          </p>
        </div>

        <section className="auth-card auth-card-compact">
          <div className="auth-card-header">
            <h2>Update password</h2>
            <p>Use at least 8 characters. You’ll return to login after success.</p>
          </div>

          {!ready ? <p className="muted">Validating recovery link...</p> : null}

          {ready && !validRecovery && !notice ? (
            <div className="auth-notice auth-notice-error">
              This password reset link is invalid or expired.
            </div>
          ) : null}

          {ready && validRecovery ? (
            <form onSubmit={onSubmit} className="auth-form-grid">
              <label className="auth-field">
                <span>New password</span>
                <input
                  className="auth-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={MIN_PASSWORD_LENGTH}
                  required
                />
              </label>

              <label className="auth-field">
                <span>Confirm new password</span>
                <input
                  className="auth-input"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={MIN_PASSWORD_LENGTH}
                  required
                />
              </label>

              {passwordError ? <p className="auth-notice auth-notice-error">{passwordError}</p> : null}
              {error ? <p className="auth-notice auth-notice-error">{error}</p> : null}
              {notice ? <p className="auth-notice auth-notice-success">{notice}</p> : null}

              <button className="auth-submit-button" type="submit" disabled={submitting}>
                {submitting ? 'Updating password...' : 'Update password'}
              </button>
            </form>
          ) : null}

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
