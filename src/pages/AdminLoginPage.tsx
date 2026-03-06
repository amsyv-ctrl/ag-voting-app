import { FormEvent, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { archiveEvent, bootstrapOrg } from '../lib/api'
import { getAccessToken } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { AdminLayout } from '../components/AdminLayout'
import { PageHero } from '../components/PageHero'

type EventRow = {
  id: string
  org_id: string
  name: string
  date: string | null
  location: string | null
  is_trial_event: boolean
  archived_at: string | null
  archived_by: string | null
}

type AdminProfileRow = {
  first_name: string
  last_name: string
  network: string
  address: string
}

export function AdminLoginPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const modeParam = searchParams.get('mode')
  const [authMode, setAuthMode] = useState<'login' | 'register'>(modeParam === 'register' ? 'register' : 'login')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [network, setNetwork] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [signupRole, setSignupRole] = useState('')
  const [estimatedVotingSize, setEstimatedVotingSize] = useState('')
  const [organizationType, setOrganizationType] = useState('')
  const [country, setCountry] = useState('')
  const [addressLine1, setAddressLine1] = useState('')
  const [addressLine2, setAddressLine2] = useState('')
  const [city, setCity] = useState('')
  const [stateRegion, setStateRegion] = useState('')
  const [postalCode, setPostalCode] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [events, setEvents] = useState<EventRow[]>([])
  const [archivedEvents, setArchivedEvents] = useState<EventRow[]>([])
  const [profile, setProfile] = useState<AdminProfileRow | null>(null)
  const [hasSession, setHasSession] = useState(false)
  const [ready, setReady] = useState(false)
  const [menuEventId, setMenuEventId] = useState<string | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<EventRow | null>(null)
  const [isArchiving, setIsArchiving] = useState(false)
  const [hasAnyBallot, setHasAnyBallot] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const menuFirstItemRef = useRef<HTMLButtonElement | null>(null)
  const createEventFormRef = useRef<HTMLFormElement | null>(null)
  const createEventNameRef = useRef<HTMLInputElement | null>(null)

  const [newName, setNewName] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newLocation, setNewLocation] = useState('')

  useEffect(() => {
    if (!hasSession) {
      document.title = authMode === 'register'
        ? 'Create Admin Account – MinistryVote'
        : 'Admin Login – MinistryVote'
    }
  }, [authMode, hasSession])

  async function loadEvents() {
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) {
      setHasSession(false)
      setEvents([])
      setArchivedEvents([])
      setProfile(null)
      return
    }
    setHasSession(true)

    const { data: profileData, error: profileError } = await supabase
      .from('admin_profiles')
      .select('first_name,last_name,network,address')
      .eq('user_id', sessionData.session.user.id)
      .maybeSingle()

    if (profileError && profileError.code !== 'PGRST116') {
      setError(profileError.message)
      return
    }

    setProfile(profileData ?? null)

    const { data, error: eventsError } = await supabase
      .from('events')
      .select('id,org_id,name,date,location,is_trial_event,archived_at,archived_by')
      .is('archived_at', null)
      .order('created_at', { ascending: false })

    if (eventsError) {
      setError(eventsError.message)
      return
    }

    setEvents(data ?? [])

    const { data: archivedData, error: archivedEventsError } = await supabase
      .from('events')
      .select('id,org_id,name,date,location,is_trial_event,archived_at,archived_by')
      .not('archived_at', 'is', null)
      .order('archived_at', { ascending: false })

    if (archivedEventsError) {
      setError(archivedEventsError.message)
      return
    }

    setArchivedEvents(archivedData ?? [])

    if ((data ?? []).length === 0) {
      setHasAnyBallot(false)
      return
    }

    const eventIds = (data ?? []).map((event) => event.id)
    const { count, error: ballotCountError } = await supabase
      .from('ballots')
      .select('id', { count: 'exact', head: true })
      .in('event_id', eventIds)
      .is('deleted_at', null)

    if (ballotCountError) {
      setError(ballotCountError.message)
      return
    }
    setHasAnyBallot((count ?? 0) > 0)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        setHasSession(true)
        await loadEvents()
      }
      setReady(true)
    })
  }, [])

  useEffect(() => {
    const next = authMode === 'register' ? 'register' : null
    if (next) {
      setSearchParams({ mode: next })
    } else {
      setSearchParams({})
    }
  }, [authMode, setSearchParams])

  useEffect(() => {
    if (!menuEventId) return
    menuFirstItemRef.current?.focus()

    function handleOutsideClick(ev: MouseEvent) {
      if (!menuRef.current) return
      if (!menuRef.current.contains(ev.target as Node)) {
        setMenuEventId(null)
      }
    }

    function handleEsc(ev: KeyboardEvent) {
      if (ev.key === 'Escape') setMenuEventId(null)
    }

    window.addEventListener('mousedown', handleOutsideClick)
    window.addEventListener('keydown', handleEsc)
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick)
      window.removeEventListener('keydown', handleEsc)
    }
  }, [menuEventId])

  async function onLogin(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)

    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password })
    if (loginError) {
      setError(loginError.message)
      return
    }

    const token = await getAccessToken()
    if (!token) {
      setError('Signed in, but could not establish a session token.')
      return
    }

    try {
      const org = await bootstrapOrg(token)
      if (org.created) {
        navigate('/admin/org')
        return
      }
      setHasSession(true)
      await loadEvents()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to initialize organization')
    }
  }

  async function onRegister(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)

    const composedAddress = [
      addressLine1.trim(),
      addressLine2.trim(),
      [city.trim(), stateRegion.trim(), postalCode.trim()].filter(Boolean).join(' ')
    ]
      .filter(Boolean)
      .join(', ')

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          network,
          address: composedAddress,
          organization_name: organizationName,
          signup_role: signupRole || null,
          estimated_voting_size: estimatedVotingSize || null,
          organization_type: organizationType || null,
          country: country || null,
          address_line1: addressLine1 || null,
          address_line2: addressLine2 || null,
          city: city || null,
          state_region: stateRegion || null,
          postal_code: postalCode || null
        }
      }
    })

    if (signUpError) {
      setError(signUpError.message)
      return
    }

    if (data.session) {
      setNotice('Admin account created. You are signed in and can create events now.')
      const token = await getAccessToken()
      if (!token) {
        setError('Signed in, but could not establish a session token.')
        return
      }

      try {
        const org = await bootstrapOrg(token)
        if (org.created) {
          navigate('/admin/org')
          return
        }
        setHasSession(true)
        await loadEvents()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to initialize organization')
      }
      return
    }

    setNotice('Admin account created. Check your email to confirm, then sign in.')
    setAuthMode('login')
  }

  async function onCreateEvent(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const { error: createError } = await supabase.from('events').insert({
      name: newName,
      date: newDate || null,
      location: newLocation || null
    })

    if (createError) {
      setError(createError.message)
      return
    }

    setNewName('')
    setNewDate('')
    setNewLocation('')
    await loadEvents()
  }

  async function onLogout() {
    await supabase.auth.signOut()
    setHasSession(false)
    setEvents([])
    setArchivedEvents([])
    setHasAnyBallot(false)
    setProfile(null)
  }

  async function onConfirmArchiveEvent() {
    if (!archiveTarget) return
    setError(null)
    setIsArchiving(true)
    try {
      const token = await getAccessToken()
      if (!token) {
        setError('Session missing. Please sign in again.')
        return
      }
      await archiveEvent(token, archiveTarget.id)
      setNotice('Event archived')
      setArchiveTarget(null)
      await loadEvents()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not archive event')
    } finally {
      setIsArchiving(false)
    }
  }

  function jumpToCreateEvent() {
    createEventFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.setTimeout(() => createEventNameRef.current?.focus(), 200)
  }

  if (!ready) return <main className="auth-page"><div className="auth-container"><p>Loading...</p></div></main>

  if (!hasSession) {
    return (
      <main className="auth-page auth-page-branded">
        <section className="auth-hero-shell">
          <div className="auth-brand-panel glow-hover">
            <p className="auth-kicker">MinistryVote Admin</p>
            <h1 className="auth-display-title">Run your next election with confidence.</h1>
            <p className="auth-display-copy">
              Manage events, launch ballots, and keep governance voting moving with receipts, sealed records,
              and projector-ready displays.
            </p>
            <div className="auth-brand-points">
              <span>Secret ballots</span>
              <span>Runoff rounds</span>
              <span>Official record exports</span>
            </div>
          </div>

          <section className="auth-card">
            <div className="auth-card-header">
              <div>
                <p className="auth-wordmark">MinistryVote</p>
                <h2>{authMode === 'login' ? 'Admin login' : 'Create admin account'}</h2>
                <p>
                  {authMode === 'login'
                    ? 'Sign in to manage events, ballots, and voting sessions.'
                    : 'Set up your organization, create your first event, and be ready to vote in minutes.'}
                </p>
              </div>
            </div>

            <div className="auth-toggle-row" role="tablist" aria-label="Authentication mode">
              <button
                className={authMode === 'login' ? 'auth-toggle auth-toggle-active' : 'auth-toggle'}
                onClick={() => setAuthMode('login')}
                type="button"
              >
                Log In
              </button>
              <button
                className={authMode === 'register' ? 'auth-toggle auth-toggle-active' : 'auth-toggle'}
                onClick={() => setAuthMode('register')}
                type="button"
              >
                Register
              </button>
            </div>

            {error ? <p className="auth-notice auth-notice-error">{error}</p> : null}
            {notice ? <p className="auth-notice auth-notice-success">{notice}</p> : null}

            {authMode === 'login' ? (
              <form onSubmit={onLogin} className="auth-form-grid">
                <label className="auth-field">
                  <span>Email</span>
                  <input
                    className="auth-input"
                    type="email"
                    placeholder="you@church.org"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </label>
                <label className="auth-field">
                  <span>Password</span>
                  <input
                    className="auth-input"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </label>

                <div className="auth-inline-links">
                  <Link to="/forgot-password">Forgot password?</Link>
                </div>

                <button className="auth-submit-button" type="submit">Sign In</button>
              </form>
            ) : (
              <form onSubmit={onRegister} className="auth-form-grid auth-form-grid-register">
                <div className="auth-form-columns">
                  <label className="auth-field">
                    <span>First name</span>
                    <input className="auth-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                  </label>
                  <label className="auth-field">
                    <span>Last name</span>
                    <input className="auth-input" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                  </label>
                </div>

                <label className="auth-field">
                  <span>Network</span>
                  <input className="auth-input" value={network} onChange={(e) => setNetwork(e.target.value)} required />
                </label>

                <label className="auth-field">
                  <span>Email</span>
                  <input className="auth-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </label>

                <label className="auth-field">
                  <span>Password</span>
                  <input
                    className="auth-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                </label>

                <label className="auth-field">
                  <span>Church or Organization Name</span>
                  <input
                    className="auth-input"
                    value={organizationName}
                    onChange={(e) => setOrganizationName(e.target.value)}
                    required
                  />
                </label>

                <label className="auth-field">
                  <span>Your Role</span>
                  <select className="auth-input auth-select" value={signupRole} onChange={(e) => setSignupRole(e.target.value)}>
                    <option value="">Select a role</option>
                    <option value="Lead Pastor">Lead Pastor</option>
                    <option value="Executive Pastor">Executive Pastor</option>
                    <option value="Church Staff">Church Staff</option>
                    <option value="Board Member">Board Member</option>
                    <option value="District / Network Staff">District / Network Staff</option>
                    <option value="Other">Other</option>
                  </select>
                </label>

                <div className="auth-form-columns">
                  <label className="auth-field">
                    <span>Estimated Voting Size</span>
                    <select className="auth-input auth-select" value={estimatedVotingSize} onChange={(e) => setEstimatedVotingSize(e.target.value)}>
                      <option value="">Select size</option>
                      <option value="10–50">10–50</option>
                      <option value="50–100">50–100</option>
                      <option value="100–250">100–250</option>
                      <option value="250–500">250–500</option>
                      <option value="500+">500+</option>
                    </select>
                  </label>
                  <label className="auth-field">
                    <span>Organization Type</span>
                    <select className="auth-input auth-select" value={organizationType} onChange={(e) => setOrganizationType(e.target.value)}>
                      <option value="">Select type</option>
                      <option value="Local Church">Local Church</option>
                      <option value="District / Network">District / Network</option>
                      <option value="Ministry Organization">Ministry Organization</option>
                      <option value="Nonprofit Board">Nonprofit Board</option>
                    </select>
                  </label>
                </div>

                <label className="auth-field">
                  <span>Country</span>
                  <input className="auth-input" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Optional" />
                </label>

                <label className="auth-field">
                  <span>Address line 1</span>
                  <input className="auth-input" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
                </label>
                <label className="auth-field">
                  <span>Address line 2</span>
                  <input className="auth-input" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} placeholder="Optional" />
                </label>

                <div className="auth-form-columns auth-form-columns-third">
                  <label className="auth-field">
                    <span>City</span>
                    <input className="auth-input" value={city} onChange={(e) => setCity(e.target.value)} />
                  </label>
                  <label className="auth-field">
                    <span>State / Region</span>
                    <input className="auth-input" value={stateRegion} onChange={(e) => setStateRegion(e.target.value)} />
                  </label>
                  <label className="auth-field">
                    <span>Postal code</span>
                    <input className="auth-input" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
                  </label>
                </div>

                <p className="auth-helper-copy">No credit card required to start your trial.</p>
                <button className="auth-submit-button" type="submit">Create Admin Account</button>
              </form>
            )}

            <div className="auth-utility-links">
              <Link to="/privacy">Privacy Policy</Link>
              <span>•</span>
              <Link to="/terms">Terms of Use</Link>
              <span>•</span>
              <Link to="/contact">Contact</Link>
            </div>
          </section>
        </section>
      </main>
    )
  }

  return (
    <AdminLayout
      breadcrumb={['Events']}
      onSignOut={onLogout}
      headerActions={
        <button className="btn btn-primary" type="button" onClick={jumpToCreateEvent}>
          + New Event
        </button>
      }
    >
      <PageHero
        title="Events"
        subtitle="Create and manage events"
        rightActions={
          <Link to="/admin/org">
            <button className="btn btn-secondary secondary" type="button">Account</button>
          </Link>
        }
      />
      <section className="admin-events-grid">
        <section className="ui-card admin-surface compact-helper-card admin-guidance-card">
          <div className="admin-surface-header">
            <div>
              <p className="admin-surface-kicker">Getting Started</p>
              <h3>Launch events with a clear workflow</h3>
            </div>
          </div>
          <div className="admin-guidance-steps">
            <article className="admin-guidance-step">
              <span className="admin-guidance-number">1</span>
              <div>
                <h4>Create an event for each meeting or session</h4>
                <p className="muted">Board meetings, annual business meetings, and conferences should each have their own event record.</p>
              </div>
            </article>
            <article className="admin-guidance-step">
              <span className="admin-guidance-number">2</span>
              <div>
                <h4>Add as many ballots as needed inside that event</h4>
                <p className="muted">Ballots stay organized under the event so links, displays, exports, and records remain easy to manage.</p>
              </div>
            </article>
            <article className="admin-guidance-step">
              <span className="admin-guidance-number">3</span>
              <div>
                <h4>Keep past and future meetings in one dashboard</h4>
                <p className="muted">Active events stay ready to run, while archived events remain available for review and exports.</p>
              </div>
            </article>
          </div>
        </section>

        {profile ? (
          <section className="ui-card admin-surface admin-profile-card">
            <div className="admin-surface-header">
              <div>
                <p className="admin-surface-kicker">Admin Profile</p>
                <h3>{profile.first_name} {profile.last_name}</h3>
              </div>
            </div>
            <div className="admin-profile-grid">
              <div className="admin-profile-item">
                <span className="admin-profile-label">Network</span>
                <span className="admin-profile-value">{profile.network || 'Not provided'}</span>
              </div>
              <div className="admin-profile-item admin-profile-item-wide">
                <span className="admin-profile-label">Address</span>
                <span className="admin-profile-value">{profile.address || 'Not provided'}</span>
              </div>
            </div>
          </section>
        ) : null}
      </section>

      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="winner">{notice}</p> : null}

      <section className="ui-card admin-surface admin-create-card">
        <div className="admin-surface-header">
          <div>
            <p className="admin-surface-kicker">Create Event</p>
            <h3>Start a new meeting record</h3>
            <p className="muted">Use a clear event name, date, and location so your ballots and exports are easy to reference later.</p>
          </div>
        </div>

        <form ref={createEventFormRef} onSubmit={onCreateEvent} className="form-grid admin-create-form">
          <label className="form-row">
            Event name
            <input className="input" ref={createEventNameRef} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Network Conference 2026" required />
          </label>
          <label className="form-row">
            Date
            <input className="input" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} required />
          </label>
          <label className="form-row">
            Location
            <input className="input" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="Phoenix Convention Center" required />
          </label>
          <div className="form-actions form-row-full">
            <button className="btn btn-primary" type="submit">Create Event</button>
          </div>
        </form>
      </section>

      {!hasAnyBallot ? (
        <section className="ui-card admin-surface admin-empty-state">
          <div className="admin-surface-header">
            <div>
              <p className="admin-surface-kicker">First Vote Setup</p>
              <h3>Welcome — let’s run your first vote</h3>
              <p className="muted">Create an event, add your first ballot, and you’ll be ready to vote in minutes.</p>
            </div>
          </div>
          <div className="admin-guidance-steps">
            <article className="admin-guidance-step">
              <span className="admin-guidance-number">1</span>
              <div>
                <h4>Create your first event</h4>
                <p className="muted">An event is a meeting or session such as a board meeting, business meeting, or conference.</p>
                <button className="btn btn-primary" type="button" onClick={jumpToCreateEvent}>Create Event</button>
              </div>
            </article>
            <article className="admin-guidance-step">
              <span className="admin-guidance-number">2</span>
              <div>
                <h4>Add your first ballot</h4>
                <p className="muted">A ballot is a single decision or election. Add candidates or choices and open voting when ready.</p>
                {events.length === 0 ? (
                  <>
                    <button type="button" className="btn btn-secondary secondary" disabled>Create Ballot</button>
                    <p className="muted">Create an event first</p>
                  </>
                ) : (
                  <Link to={`/admin/events/${events[0].id}#create-ballot`}>
                    <button type="button" className="btn btn-secondary secondary">Create Ballot</button>
                  </Link>
                )}
              </div>
            </article>
          </div>
        </section>
      ) : null}

      <section className="ui-card admin-surface admin-events-list-card">
        <div className="admin-surface-header">
          <div>
            <p className="admin-surface-kicker">Active Events</p>
            <h3>Current meeting dashboard</h3>
            <p className="muted">Open an event to manage ballots, QR codes, pins, exports, and live voting views.</p>
          </div>
        </div>

        <div className="event-list admin-event-list">
          {events.map((event) => (
            <div className="event-item admin-event-row" key={event.id}>
              <div className="event-item-main">
                <div className="admin-event-title-row">
                  <strong>{event.name}</strong>
                  {event.is_trial_event ? <span className="admin-event-badge">Trial</span> : null}
                </div>
                <div className="admin-event-meta">
                  <span>{event.location || 'No location set'}</span>
                  <span>•</span>
                  <span>{event.date || 'No date set'}</span>
                </div>
              </div>
              <div className="event-row-actions">
                <Link to={`/admin/events/${event.id}`}>
                  <button className="btn btn-secondary secondary">Open</button>
                </Link>
                <div className="event-actions-menu-wrap">
                  <button
                    type="button"
                    className="icon-kebab-btn"
                    aria-label={`Event actions for ${event.name}`}
                    aria-haspopup="menu"
                    aria-expanded={menuEventId === event.id}
                    onClick={() => setMenuEventId((curr) => (curr === event.id ? null : event.id))}
                  >
                    &hellip;
                  </button>
                  {menuEventId === event.id && (
                    <div className="event-actions-menu" role="menu" ref={menuRef}>
                      <button
                        type="button"
                        role="menuitem"
                        className="event-actions-menu-item event-actions-menu-item-danger"
                        ref={menuFirstItemRef}
                        onClick={() => {
                          setMenuEventId(null)
                          setArchiveTarget(event)
                        }}
                      >
                        Archive event
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="ui-card admin-surface admin-archived-card">
        <details className="event-archive-section">
          <summary>Archived events ({archivedEvents.length})</summary>
          {archivedEvents.length === 0 ? (
            <p className="muted" style={{ marginTop: '0.6rem' }}>No archived events.</p>
          ) : (
            <div className="event-list admin-event-list" style={{ marginTop: '0.9rem' }}>
              {archivedEvents.map((event) => (
                <div className="event-item admin-event-row" key={event.id}>
                  <div className="event-item-main">
                    <div className="admin-event-title-row">
                      <strong>{event.name}</strong>
                      <span className="admin-event-badge admin-event-badge-muted">Archived</span>
                    </div>
                    <div className="admin-event-meta">
                      <span>{event.location || 'No location set'}</span>
                      <span>•</span>
                      <span>{event.date || 'No date set'}</span>
                    </div>
                    <div className="muted" style={{ marginTop: '0.45rem' }}>
                      Archived: {event.archived_at ? new Date(event.archived_at).toLocaleString() : 'N/A'}
                    </div>
                  </div>
                  <div className="event-row-actions">
                    <Link to={`/admin/events/${event.id}`}>
                      <button className="btn btn-secondary secondary">Open</button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </details>
      </section>
      {archiveTarget && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="archive-event-title">
            <h3 id="archive-event-title">Archive this event?</h3>
            <p>
              Archiving will close any open votes and make the event read-only.
              You can still view and export results.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary secondary" onClick={() => setArchiveTarget(null)} disabled={isArchiving}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger danger-btn" onClick={onConfirmArchiveEvent} disabled={isArchiving}>
                {isArchiving ? 'Archiving...' : 'Archive'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
