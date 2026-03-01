import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { adminGeneratePins } from '../lib/api'
import { getAccessToken, requireSession } from '../lib/auth'

type BallotRow = {
  id: string
  title: string
  slug: string
  status: 'DRAFT' | 'OPEN' | 'CLOSED'
  requires_pin: boolean
  created_at: string
}

type PinRow = {
  id: string
  code: string
  is_active: boolean
  created_at: string
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function AdminEventPage() {
  const { id } = useParams()
  const eventId = id as string
  const navigate = useNavigate()

  const [eventName, setEventName] = useState('')
  const [ballots, setBallots] = useState<BallotRow[]>([])
  const [activePins, setActivePins] = useState<PinRow[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [majorityRule, setMajorityRule] = useState<'SIMPLE' | 'TWO_THIRDS'>('SIMPLE')
  const [ballotType, setBallotType] = useState<'YES_NO' | 'PICK_ONE'>('PICK_ONE')
  const [requiresPin, setRequiresPin] = useState(true)
  const [pinCount, setPinCount] = useState(100)
  const [pinsOutput, setPinsOutput] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const appBase = useMemo(() => window.location.origin, [])

  async function load() {
    const session = await requireSession()
    if (!session) {
      navigate('/admin')
      return
    }

    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('name')
      .eq('id', eventId)
      .single()

    if (eventError) {
      setError(eventError.message)
      return
    }
    setEventName(eventData.name)

    const { data: ballotData, error: ballotError } = await supabase
      .from('ballots')
      .select('id,title,slug,status,requires_pin,created_at')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })

    if (ballotError) {
      setError(ballotError.message)
      return
    }

    setBallots(ballotData ?? [])

    const { data: pinData, error: pinError } = await supabase
      .from('pins')
      .select('id,code,is_active,created_at')
      .eq('event_id', eventId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (pinError) {
      setError(pinError.message)
      return
    }

    setActivePins(pinData ?? [])
  }

  useEffect(() => {
    load()
  }, [eventId])

  async function onCreateBallot(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const slug = `${slugify(title)}-${Math.random().toString(36).slice(2, 8)}`

    const { data, error: createError } = await supabase
      .from('ballots')
      .insert({
        event_id: eventId,
        title,
        description: description || null,
        slug,
        ballot_type: ballotType,
        majority_rule: majorityRule,
        requires_pin: requiresPin,
        status: 'DRAFT'
      })
      .select('id')
      .single()

    if (createError || !data) {
      setError(createError?.message ?? 'Unable to create ballot')
      return
    }

    if (ballotType === 'YES_NO') {
      await supabase.from('choices').insert([
        { ballot_id: data.id, label: 'Yes', sort_order: 1 },
        { ballot_id: data.id, label: 'No', sort_order: 2 }
      ])
    }

    setTitle('')
    setDescription('')
    setRequiresPin(true)
    await load()
  }

  async function onGeneratePins(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const token = await getAccessToken()
    if (!token) {
      navigate('/admin')
      return
    }

    try {
      const result = await adminGeneratePins(token, eventId, pinCount)
      setPinsOutput(result.generated)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate PINs')
    }
  }

  async function onDeleteAllPins() {
    const typed = window.prompt('Type DELETE to permanently remove all PINs for this event.')
    if (typed !== 'DELETE') {
      return
    }

    setError(null)
    const { error: deleteError } = await supabase.from('pins').delete().eq('event_id', eventId)
    if (deleteError) {
      setError(deleteError.message)
      return
    }

    setPinsOutput([])
    await load()
  }

  return (
    <main className="page">
      <section className="card">
        <h1>{eventName || 'Event'}</h1>
        <p>Manage ballots and delegate PINs.</p>
        <Link to="/admin">Back to admin</Link>
        {error && <p className="error">{error}</p>}
      </section>

      <section className="card">
        <h2>Ballots</h2>
        <ul className="list">
          {ballots.map((ballot) => (
            <li key={ballot.id}>
              <div>
                <strong>{ballot.title}</strong>
                <div>Status: {ballot.status}</div>
                <div>PIN required: {ballot.requires_pin ? 'Yes' : 'No'}</div>
                <div>Vote URL: {appBase}/vote/{ballot.slug}</div>
                <div>Display URL: {appBase}/display/{ballot.slug}</div>
              </div>
              <Link to={`/admin/ballots/${ballot.id}`}>Manage</Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Create ballot</h2>
        <p className="muted">
          If ballot PINs are turned on, a voter must enter their unique PIN for each vote.
        </p>
        <form onSubmit={onCreateBallot} className="stack">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ballot title" required />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
          <label>
            Ballot type
            <select value={ballotType} onChange={(e) => setBallotType(e.target.value as 'YES_NO' | 'PICK_ONE')}>
              <option value="PICK_ONE">Pick one candidate</option>
              <option value="YES_NO">Yes / No</option>
            </select>
          </label>
          <label>
            Majority rule
            <select value={majorityRule} onChange={(e) => setMajorityRule(e.target.value as 'SIMPLE' | 'TWO_THIRDS')}>
              <option value="SIMPLE">Simple majority (&gt;50%)</option>
              <option value="TWO_THIRDS">Two thirds (≥66.67%)</option>
            </select>
          </label>
          <label className="inline">
            <input type="checkbox" checked={requiresPin} onChange={(e) => setRequiresPin(e.target.checked)} />
            Require PIN for this ballot
          </label>
          <button type="submit">Create ballot</button>
        </form>
      </section>

      <section className="card">
        <h2>Generate 4-digit PINs</h2>
        <p>Active PINs for this event: <strong>{activePins.length}</strong></p>
        <form onSubmit={onGeneratePins} className="stack inline">
          <input
            type="number"
            min={1}
            max={500}
            value={pinCount}
            onChange={(e) => setPinCount(Math.max(1, Math.min(Number(e.target.value), 500)))}
          />
          <button type="submit">Generate</button>
        </form>
        <button className="secondary" onClick={onDeleteAllPins}>Delete all PINs</button>
        {pinsOutput.length > 0 && (
          <details>
            <summary>Show newly generated PINs ({pinsOutput.length})</summary>
            <pre className="code-block">{pinsOutput.join(', ')}</pre>
          </details>
        )}
        <details>
          <summary>View active PINs ({activePins.length})</summary>
          {activePins.length === 0 ? (
            <p>No active PINs yet.</p>
          ) : (
            <pre className="code-block">{activePins.map((pin) => pin.code).join(', ')}</pre>
          )}
        </details>
      </section>
    </main>
  )
}
