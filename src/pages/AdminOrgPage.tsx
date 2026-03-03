import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { bootstrapOrg } from '../lib/api'
import { getAccessToken, requireSession } from '../lib/auth'
import { supabase } from '../lib/supabase'

type OrgState = {
  id: string
  name: string
  mode: 'DEMO' | 'TRIAL' | 'PAID'
  trial_votes_used: number
  trial_votes_limit: number
  subscription_status: string | null
  current_period_end: string | null
  is_active: boolean
}

function formatDate(value: string | null) {
  if (!value) return 'N/A'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

export function AdminOrgPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [role, setRole] = useState<'OWNER' | 'ADMIN' | 'STAFF' | null>(null)
  const [org, setOrg] = useState<OrgState | null>(null)

  async function load() {
    setError(null)
    setLoading(true)
    const session = await requireSession()
    if (!session) {
      navigate('/admin')
      return
    }

    const token = await getAccessToken()
    if (!token) {
      navigate('/admin')
      return
    }

    try {
      const data = await bootstrapOrg(token)
      setRole(data.role)
      setOrg(data.org)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load organization')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function onSignOut() {
    await supabase.auth.signOut()
    navigate('/admin')
  }

  if (loading) {
    return (
      <main className="page">
        <section className="card">
          <h1>Organization Dashboard</h1>
          <p>Loading organization...</p>
        </section>
      </main>
    )
  }

  return (
    <main className="page">
      <section className="card">
        <div className="auth-header-row">
          <h1>Organization Dashboard</h1>
          <button className="logout-btn" onClick={onSignOut}>Sign Out</button>
        </div>
        {error && <p className="error">{error}</p>}
        {org && (
          <>
            <p><strong>Name:</strong> {org.name}</p>
            <p><strong>Role:</strong> {role}</p>
            <p><strong>Mode:</strong> {org.mode}</p>
            <p><strong>Trial usage:</strong> {org.trial_votes_used}/{org.trial_votes_limit} votes</p>
            <p><strong>Subscription status:</strong> {org.subscription_status ?? 'N/A'}</p>
            <p><strong>Current period end:</strong> {formatDate(org.current_period_end)}</p>
            <p><strong>Active:</strong> {org.is_active ? 'Yes' : 'No'}</p>
          </>
        )}
      </section>

      <section className="card">
        <h2>Trial Onboarding</h2>
        <p className="muted">Step 3 will enable one-click trial event creation and usage enforcement.</p>
        <button disabled>Create your free trial event (100 votes)</button>
        <div style={{ marginTop: '0.75rem' }}>
          <Link to="/admin">Go to Event Manager</Link>
        </div>
      </section>
    </main>
  )
}

