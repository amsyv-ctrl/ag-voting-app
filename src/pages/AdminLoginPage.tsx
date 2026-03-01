import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type EventRow = {
  id: string
  name: string
  date: string | null
  location: string | null
}

export function AdminLoginPage() {
  const [searchParams, setSearchParams] = useSearchParams()
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
  const [hasSession, setHasSession] = useState(false)
  const [ready, setReady] = useState(false)

  const [newName, setNewName] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newLocation, setNewLocation] = useState('')

  const isAuthenticated = useMemo(() => hasSession, [hasSession])

  async function loadEvents() {
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) {
      setHasSession(false)
      setEvents([])
      return
    }
    setHasSession(true)

    const { data, error: eventsError } = await supabase
      .from('events')
      .select('id,name,date,location')
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

    setHasSession(true)
    await loadEvents()
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
      setHasSession(true)
      await loadEvents()
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
  }

  if (!ready) return <main className="page"><p>Loading...</p></main>

  return (
    <main className="page">
      <section className="card">
        <h1>AG Voting Admin</h1>
        <p>Log in or register to create your own voting session and events.</p>

        <div className="inline">
          <button className={authMode === 'login' ? '' : 'secondary'} onClick={() => setAuthMode('login')}>
            Log in as admin
          </button>
          <button className={authMode === 'register' ? '' : 'secondary'} onClick={() => setAuthMode('register')}>
            Register admin account
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
            <button type="submit">Sign in</button>
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
            <button type="submit">Create admin account</button>
          </form>
        )}
      </section>

      <section className="card">
        <h2>Events</h2>
        <button onClick={onLogout} className="secondary">Sign out</button>
        <form onSubmit={onCreateEvent} className="stack">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Event name" required />
          <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <input value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="Location" />
          <button type="submit" disabled={!isAuthenticated}>Create event</button>
        </form>

        <ul className="list">
          {events.map((event) => (
            <li key={event.id}>
              <div>
                <strong>{event.name}</strong>
                <div>{event.location || 'No location'} · {event.date || 'No date'}</div>
              </div>
              <Link to={`/admin/events/${event.id}`}>Open</Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
