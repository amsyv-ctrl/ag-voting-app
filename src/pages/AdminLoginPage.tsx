import { FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type EventRow = {
  id: string
  name: string
  date: string | null
  location: string | null
}

export function AdminLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<EventRow[]>([])
  const [ready, setReady] = useState(false)

  const [newName, setNewName] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newLocation, setNewLocation] = useState('')

  async function loadEvents() {
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
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        loadEvents()
      }
      setReady(true)
    })
  }, [])

  async function onLogin(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password })
    if (loginError) {
      setError(loginError.message)
      return
    }
    await loadEvents()
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
    setEvents([])
  }

  if (!ready) return <main className="page"><p>Loading...</p></main>

  return (
    <main className="page">
      <section className="card">
        <h1>AG Voting Admin</h1>
        <p>Sign in to manage events, ballots, and results.</p>
        {error && <p className="error">{error}</p>}
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
      </section>

      <section className="card">
        <h2>Events</h2>
        <button onClick={onLogout} className="secondary">Sign out</button>
        <form onSubmit={onCreateEvent} className="stack">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Event name" required />
          <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <input value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="Location" />
          <button type="submit">Create event</button>
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
