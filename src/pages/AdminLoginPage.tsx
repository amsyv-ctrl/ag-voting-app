import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type EventRow = {
  id: string
  org_id: string
  name: string
  date: string | null
  location: string | null
  is_trial_event: boolean
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
  const [profile, setProfile] = useState<AdminProfileRow | null>(null)
  const [hasSession, setHasSession] = useState(false)
  const [ready, setReady] = useState(false)

  const [newName, setNewName] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newLocation, setNewLocation] = useState('')

  async function loadEvents() {
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) {
      setHasSession(false)
      setEvents([])
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
      .select('id,org_id,name,date,location,is_trial_event')
      .order('created_at', { ascending: false })

    if (eventsError) {
      setError(eventsError.message)
      return
    }

    setEvents(data ?? [])
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

  async function onLogin(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)

    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password })
    if (loginError) {
      setError(loginError.message)
      return
    }

    navigate('/admin/org')
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
      navigate('/admin/org')
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
    setProfile(null)
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
              <button className="logout-btn" onClick={onLogout}>Sign Out</button>
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

            <div className="event-list">
              {events.map((event) => (
                <div className="event-item" key={event.id}>
                  <div>
                    <strong>{event.name}</strong>
                    <div>{event.location || 'No location'} - {event.date || 'No date'}</div>
                  </div>
                  <Link to={`/admin/events/${event.id}`}>
                    <button className="secondary">Open</button>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
