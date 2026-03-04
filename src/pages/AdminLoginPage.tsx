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
      <main className="auth-page">
        <section className="auth-container">
          <div>
            <h1 className="auth-title">AG Voting Admin</h1>
            <p className="muted">Log in or register to manage voting sessions and events.</p>

            <div className="inline">
              <button className={authMode === 'login' ? '' : 'secondary'} onClick={() => setAuthMode('login')}>
                Log In as Admin
              </button>
              <button className={authMode === 'register' ? '' : 'secondary'} onClick={() => setAuthMode('register')}>
                Register Admin Account
              </button>
            </div>

            {error && <p className="error">{error}</p>}
            {notice && <p className="winner">{notice}</p>}

            {authMode === 'login' ? (
              <form onSubmit={onLogin} className="stack">
                <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button type="submit">Sign In</button>
              </form>
            ) : (
              <form onSubmit={onRegister} className="stack">
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" required />
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" required />
                <input value={network} onChange={(e) => setNetwork(e.target.value)} placeholder="Network" required />
                <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
                <input
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  placeholder="Church or Organization Name"
                  required
                />
                <select value={signupRole} onChange={(e) => setSignupRole(e.target.value)}>
                  <option value="">Your Role (optional)</option>
                  <option value="Lead Pastor">Lead Pastor</option>
                  <option value="Executive Pastor">Executive Pastor</option>
                  <option value="Church Staff">Church Staff</option>
                  <option value="Board Member">Board Member</option>
                  <option value="District / Network Staff">District / Network Staff</option>
                  <option value="Other">Other</option>
                </select>
                <select value={estimatedVotingSize} onChange={(e) => setEstimatedVotingSize(e.target.value)}>
                  <option value="">Estimated Voting Size (optional)</option>
                  <option value="10–50">10–50</option>
                  <option value="50–100">50–100</option>
                  <option value="100–250">100–250</option>
                  <option value="250–500">250–500</option>
                  <option value="500+">500+</option>
                </select>
                <select value={organizationType} onChange={(e) => setOrganizationType(e.target.value)}>
                  <option value="">Organization Type (optional)</option>
                  <option value="Local Church">Local Church</option>
                  <option value="District / Network">District / Network</option>
                  <option value="Ministry Organization">Ministry Organization</option>
                  <option value="Nonprofit Board">Nonprofit Board</option>
                </select>
                <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country (optional)" />
                <input value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} placeholder="Address line 1" />
                <input value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} placeholder="Address line 2 (optional)" />
                <div className="inline">
                  <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
                  <input value={stateRegion} onChange={(e) => setStateRegion(e.target.value)} placeholder="State / Region" />
                </div>
                <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="Postal code" />
                <p className="muted" style={{ marginTop: '-0.25rem' }}>No credit card required to start your trial.</p>
                <button type="submit">Create Admin Account</button>
              </form>
            )}
          </div>
        </section>
      </main>
    )
  }

  return (
    <AdminLayout breadcrumb={['Events']} onSignOut={onLogout}>
      <PageHero
        title="Events"
        subtitle="Create and manage events"
        rightActions={
          <Link to="/admin/org">
            <button className="btn btn-secondary secondary" type="button">Account</button>
          </Link>
        }
      />
      <section className="form-section">
            {profile && (
              <div className="ui-card">
                <h3>Admin Profile</h3>
                <p><strong>Name:</strong> {profile.first_name} {profile.last_name}</p>
                <p><strong>Network:</strong> {profile.network}</p>
                <p><strong>Address:</strong> {profile.address}</p>
              </div>
            )}

            {error && <p className="error">{error}</p>}
            {notice && <p className="winner">{notice}</p>}

            <form ref={createEventFormRef} onSubmit={onCreateEvent} className="form-grid">
              <label className="form-row">
                Event name
                <input className="input" ref={createEventNameRef} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Event name" required />
              </label>
              <label className="form-row">
                Date
                <input className="input" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} required />
              </label>
              <label className="form-row">
                Location
                <input className="input" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="Location" required />
              </label>
              <div className="form-actions form-row-full">
                <button className="btn btn-primary" type="submit">Create Event</button>
              </div>
            </form>

            {!hasAnyBallot ? (
              <div className="card" style={{ marginTop: '1rem' }}>
                <h3>Welcome — let’s run your first vote</h3>
                <p className="muted">Create an event, add your first ballot, and you’ll be ready to vote in minutes.</p>
                <div style={{ marginTop: '1rem', display: 'grid', gap: '1rem' }}>
                  <div>
                    <p><strong>1. Create your first event</strong></p>
                    <p className="muted">An event is a meeting or session (board meeting, business meeting, conference).</p>
                    <button className="btn btn-primary" type="button" onClick={jumpToCreateEvent}>Create Event</button>
                  </div>
                  <div>
                    <p><strong>2. Add your first ballot</strong></p>
                    <p className="muted">A ballot is a single decision or election. Add candidates/choices and open voting when ready.</p>
                    {events.length === 0 ? (
                      <>
                        <button type="button" className="btn btn-secondary secondary" disabled>Create Ballot</button>
                        <p className="muted" style={{ marginTop: '0.5rem' }}>Create an event first</p>
                      </>
                    ) : (
                      <Link to={`/admin/events/${events[0].id}#create-ballot`}>
                        <button type="button" className="btn btn-secondary secondary">Create Ballot</button>
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="event-list">
              {events.map((event) => (
                <div className="event-item" key={event.id}>
                  <div className="event-item-main">
                    <strong>{event.name}</strong>
                    <div>{event.location || 'No location'} - {event.date || 'No date'}</div>
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
            <details className="event-archive-section">
              <summary>Archived events ({archivedEvents.length})</summary>
              {archivedEvents.length === 0 ? (
                <p className="muted" style={{ marginTop: '0.6rem' }}>No archived events.</p>
              ) : (
                <div className="event-list" style={{ marginTop: '0.6rem' }}>
                  {archivedEvents.map((event) => (
                    <div className="event-item" key={event.id}>
                      <div className="event-item-main">
                        <strong>{event.name}</strong>
                        <div>{event.location || 'No location'} - {event.date || 'No date'}</div>
                        <div className="muted">
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
