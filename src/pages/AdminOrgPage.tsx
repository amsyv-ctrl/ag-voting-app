import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { bootstrapOrg, createTrialEvent } from '../lib/api'
import { getAccessToken, requireSession } from '../lib/auth'
import { supabase } from '../lib/supabase'

type OrgState = {
  id: string
  name: string
  mode: 'DEMO' | 'TRIAL' | 'PAID'
  trial_event_id: string | null
  trial_votes_used: number
  trial_votes_limit: number
  subscription_status: string | null
  current_period_end: string | null
  is_active: boolean
}

type ProfileState = {
  first_name: string
  last_name: string
  network: string
  address: string
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
  const [notice, setNotice] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [role, setRole] = useState<'OWNER' | 'ADMIN' | 'STAFF' | null>(null)
  const [org, setOrg] = useState<OrgState | null>(null)
  const [profile, setProfile] = useState<ProfileState>({
    first_name: '',
    last_name: '',
    network: '',
    address: ''
  })
  const [savingProfile, setSavingProfile] = useState(false)
  const [creatingTrialEvent, setCreatingTrialEvent] = useState(false)

  async function load() {
    setError(null)
    setLoading(true)
    const session = await requireSession()
    if (!session) {
      navigate('/admin')
      return
    }
    setUserId(session.user.id)

    const token = await getAccessToken()
    if (!token) {
      navigate('/admin')
      return
    }

    try {
      const data = await bootstrapOrg(token)
      setRole(data.role)
      setOrg(data.org)

      const { data: profileData, error: profileError } = await supabase
        .from('admin_profiles')
        .select('first_name,last_name,network,address')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (profileError && profileError.code !== 'PGRST116') {
        throw new Error(profileError.message)
      }

      if (profileData) {
        setProfile({
          first_name: profileData.first_name ?? '',
          last_name: profileData.last_name ?? '',
          network: profileData.network ?? '',
          address: profileData.address ?? ''
        })
      }
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

  async function onCreateTrialEvent() {
    if (!org || org.trial_event_id) return
    setNotice(null)
    setError(null)
    setCreatingTrialEvent(true)
    const token = await getAccessToken()
    if (!token) {
      setError('No session token found.')
      setCreatingTrialEvent(false)
      return
    }

    try {
      const data = await createTrialEvent(token)
      navigate(`/admin/events/${data.eventId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create trial event')
    } finally {
      setCreatingTrialEvent(false)
    }
  }

  async function onSaveProfile() {
    if (!userId) return
    setNotice(null)
    setError(null)
    setSavingProfile(true)
    const { error: updateError } = await supabase
      .from('admin_profiles')
      .upsert({
        user_id: userId,
        first_name: profile.first_name,
        last_name: profile.last_name,
        network: profile.network,
        address: profile.address
      })

    setSavingProfile(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setNotice('Profile updated.')
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

  const isPaidActive = !!(org?.mode === 'PAID' && org?.is_active)
  const isTrialActive = !!(
    org?.mode === 'TRIAL' &&
    !!org?.trial_event_id &&
    (org?.trial_votes_used ?? 0) < (org?.trial_votes_limit ?? 0)
  )
  const canStartTrialEvent = !!(
    org?.mode === 'TRIAL' &&
    !org?.trial_event_id &&
    (org?.trial_votes_used ?? 0) < (org?.trial_votes_limit ?? 0)
  )
  const isReadOnly = !isPaidActive && !isTrialActive

  return (
    <main className="page">
      <section className="card">
        <div className="auth-header-row">
          <h1>Organization Dashboard</h1>
          <div className="auth-header-actions">
            <Link to="/admin">
              <button className="secondary" type="button">Events</button>
            </Link>
            <button className="logout-btn" onClick={onSignOut}>Sign Out</button>
          </div>
        </div>
        {org && (
          <p className={isReadOnly ? 'error' : 'muted'}>
            {isReadOnly
              ? 'Subscription inactive — account is read-only. You can view/export history, but cannot run new votes.'
              : org.mode === 'TRIAL'
                ? `Trial mode: ${org.trial_votes_used}/${org.trial_votes_limit} votes used on your trial event.`
                : 'Paid active: full access enabled.'}
          </p>
        )}
        {error && <p className="error">{error}</p>}
        {notice && <p className="winner">{notice}</p>}
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
        {!org?.trial_event_id ? (
          <p className="muted">Trial not started.</p>
        ) : org.trial_votes_used >= org.trial_votes_limit ? (
          <p className="error">Trial limit reached: {org.trial_votes_used}/{org.trial_votes_limit} votes used.</p>
        ) : (
          <p className="muted">Trial active: {org.trial_votes_used}/{org.trial_votes_limit} votes used.</p>
        )}
        <div className="inline">
          <button
            onClick={onCreateTrialEvent}
            disabled={creatingTrialEvent || !canStartTrialEvent}
          >
            {creatingTrialEvent ? 'Creating trial event...' : 'Create your free trial event (100 votes)'}
          </button>
          {org?.trial_event_id && (
            <Link to={`/admin/events/${org.trial_event_id}`}>
              <button className="secondary" type="button">Go to trial event</button>
            </Link>
          )}
        </div>
      </section>

      <section className="card">
        <h2>Edit Profile</h2>
        <div className="stack">
          <label>
            First name
            <input
              value={profile.first_name}
              onChange={(e) => setProfile((p) => ({ ...p, first_name: e.target.value }))}
            />
          </label>
          <label>
            Last name
            <input
              value={profile.last_name}
              onChange={(e) => setProfile((p) => ({ ...p, last_name: e.target.value }))}
            />
          </label>
          <label>
            Network
            <input
              value={profile.network}
              onChange={(e) => setProfile((p) => ({ ...p, network: e.target.value }))}
            />
          </label>
          <label>
            Address
            <textarea
              value={profile.address}
              onChange={(e) => setProfile((p) => ({ ...p, address: e.target.value }))}
            />
          </label>
          <button onClick={onSaveProfile} disabled={savingProfile}>
            {savingProfile ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </section>
    </main>
  )
}
