import { FormEvent, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { archiveEvent, bootstrapOrg } from '../lib/api'
import { getAccessToken } from '../lib/auth'
import { supabase } from '../lib/supabase'

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
  const [address, setAddress] = useState('')

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
  const menuRef = useRef<HTMLDivElement | null>(null)
  const menuFirstItemRef = useRef<HTMLButtonElement | null>(null)

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

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          network,
          address
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

  if (!ready) return <main className="auth-page"><div className="auth-container"><p>Loading...</p></div></main>

  return (
    <main className="auth-page">
      <section className="auth-container">
        {!hasSession ? (
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
                <textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address" required />
                <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
                <button type="submit">Create Admin Account</button>
              </form>
            )}
          </div>
        ) : (
          <div>
            <div className="auth-header-row">
              <h1 className="auth-title">Events</h1>
              <div className="auth-header-actions">
                <Link to="/admin/org">
                  <button className="secondary" type="button">Account</button>
                </Link>
                <button className="logout-btn" onClick={onLogout}>Sign Out</button>
              </div>
            </div>

            {profile && (
              <div className="card">
                <h3>Admin Profile</h3>
                <p><strong>Name:</strong> {profile.first_name} {profile.last_name}</p>
                <p><strong>Network:</strong> {profile.network}</p>
                <p><strong>Address:</strong> {profile.address}</p>
              </div>
            )}

            <form onSubmit={onCreateEvent} className="stack">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Event name" required />
              <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} required />
              <input value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="Location" required />
              <button type="submit">Create Event</button>
            </form>

            {error && <p className="error">{error}</p>}
            {notice && <p className="winner">{notice}</p>}

            <div className="event-list">
              {events.map((event) => (
                <div className="event-item" key={event.id}>
                  <div className="event-item-main">
                    <strong>{event.name}</strong>
                    <div>{event.location || 'No location'} - {event.date || 'No date'}</div>
                  </div>
                  <div className="event-row-actions">
                    <Link to={`/admin/events/${event.id}`}>
                      <button className="secondary">Open</button>
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
                          <button className="secondary">Open</button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </details>
          </div>
        )}
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
              <button type="button" className="secondary" onClick={() => setArchiveTarget(null)} disabled={isArchiving}>
                Cancel
              </button>
              <button type="button" className="danger-btn" onClick={onConfirmArchiveEvent} disabled={isArchiving}>
                {isArchiving ? 'Archiving...' : 'Archive'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
