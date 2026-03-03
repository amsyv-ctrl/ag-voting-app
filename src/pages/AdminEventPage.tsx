import { FormEvent, useMemo, useState, useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { adminGeneratePins } from '../lib/api'
import { getAccessToken, requireSession } from '../lib/auth'

type BallotRow = {
  id: string
  title: string
  incumbent_name: string | null
  slug: string
  status: 'DRAFT' | 'OPEN' | 'CLOSED' | 'MANUAL_FALLBACK'
  requires_pin: boolean
  created_at: string
}

type PinRow = {
  id: string
  code: string
  is_active: boolean
  created_at: string
}

type ExportSummaryRow = {
  ballot_id: string
  ballot_title: string
  incumbent_name: string | null
  ballot_slug: string
  vote_round: number
  majority_rule: 'SIMPLE' | 'TWO_THIRDS'
  majority_rule_applied?: 'SIMPLE' | 'TWO_THIRDS'
  result_mode?: 'NORMAL' | 'MANUAL'
  total_votes: number
  election_reached_at: string | null
  timestamp_of_close?: string | null
  opened_at?: string | null
  winner_choice_id: string | null
  winner_label: string | null
  status: 'DRAFT' | 'OPEN' | 'CLOSED' | 'MANUAL_FALLBACK'
  counts?: Array<{
    choice_id: string
    label: string
    votes: number
    pct: number
    is_withdrawn: boolean
  }>
  votes_per_choice?: Array<{
    choice_id: string
    label: string
    votes: number
    pct: number
    is_withdrawn: boolean
  }>
}

function csvCell(value: unknown) {
  const s = String(value ?? '')
  return `"${s.replace(/"/g, '""')}"`
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
  const [eventDate, setEventDate] = useState('')
  const [eventLocation, setEventLocation] = useState('')
  const [votingStaffNames, setVotingStaffNames] = useState('')
  const [ballots, setBallots] = useState<BallotRow[]>([])
  const [activePins, setActivePins] = useState<PinRow[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [incumbentName, setIncumbentName] = useState('')
  const [majorityRule, setMajorityRule] = useState<'SIMPLE' | 'TWO_THIRDS'>('SIMPLE')
  const [ballotType, setBallotType] = useState<'YES_NO' | 'PICK_ONE'>('PICK_ONE')
  const [requiresPin, setRequiresPin] = useState(true)
  const [pinCount, setPinCount] = useState(100)
  const [pinsOutput, setPinsOutput] = useState<string[]>([])
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [pinsOpen, setPinsOpen] = useState(false)

  const appBase = useMemo(() => window.location.origin, [])

  async function load() {
    const session = await requireSession()
    if (!session) {
      navigate('/admin')
      return
    }

    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('name,date,location,voting_staff_names')
      .eq('id', eventId)
      .single()

    if (eventError) {
      setError(eventError.message)
      return
    }
    setEventName(eventData.name)
    setEventDate(eventData.date ?? '')
    setEventLocation(eventData.location ?? '')
    setVotingStaffNames(eventData.voting_staff_names ?? '')

    const { data: ballotData, error: ballotError } = await supabase
      .from('ballots')
      .select('id,title,incumbent_name,slug,status,requires_pin,created_at')
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
        incumbent_name: incumbentName || null,
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
    setIncumbentName('')
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

  async function onUpdateEvent(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const { error: updateError } = await supabase
      .from('events')
      .update({
        name: eventName,
        date: eventDate || null,
        location: eventLocation || null,
        voting_staff_names: votingStaffNames || null
      })
      .eq('id', eventId)

    if (updateError) {
      setError(updateError.message)
      return
    }

    await load()
  }

  async function onExportResults() {
    setError(null)
    setExporting(true)
    try {
      const { data, error: exportError } = await supabase.rpc('export_event_results_admin', {
        p_event_id: eventId
      })
      if (exportError || !data) throw exportError ?? new Error('Export failed')

      const payload = data as {
        exported_at: string
        event: {
          id: string
          name: string
          date: string | null
          location: string | null
          voting_staff_names: string | null
        }
        summaries: ExportSummaryRow[]
      }
      const rows: string[] = []
      rows.push([
        'event_id',
        'event_name',
        'event_date',
        'event_location',
        'voting_staff_names',
        'exported_at',
        'ballot_id',
        'ballot_title',
        'incumbent_name',
        'ballot_slug',
        'vote_round',
        'result_mode',
        'majority_rule_applied',
        'ballot_status',
        'opened_at',
        'timestamp_of_close',
        'total_votes',
        'election_reached_at',
        'winner_label',
        'choice_label',
        'choice_votes',
        'choice_pct',
        'choice_withdrawn'
      ].map(csvCell).join(','))

      for (const summary of payload.summaries ?? []) {
        const choiceRows = summary.votes_per_choice ?? summary.counts ?? []
        if (choiceRows.length === 0) {
          rows.push([
            payload.event.id,
            payload.event.name,
            payload.event.date ?? '',
            payload.event.location ?? '',
            payload.event.voting_staff_names ?? '',
            payload.exported_at,
            summary.ballot_id,
            summary.ballot_title,
            summary.incumbent_name ?? '',
            summary.ballot_slug,
            summary.vote_round,
            summary.result_mode ?? 'NORMAL',
            summary.majority_rule_applied ?? summary.majority_rule,
            summary.status,
            summary.opened_at ?? '',
            summary.timestamp_of_close ?? '',
            summary.total_votes,
            summary.election_reached_at ?? '',
            summary.winner_label ?? '',
            '',
            '',
            '',
            ''
          ].map(csvCell).join(','))
          continue
        }

        for (const choice of choiceRows) {
          rows.push([
            payload.event.id,
            payload.event.name,
            payload.event.date ?? '',
            payload.event.location ?? '',
            payload.event.voting_staff_names ?? '',
            payload.exported_at,
            summary.ballot_id,
            summary.ballot_title,
            summary.incumbent_name ?? '',
            summary.ballot_slug,
            summary.vote_round,
            summary.result_mode ?? 'NORMAL',
            summary.majority_rule_applied ?? summary.majority_rule,
            summary.status,
            summary.opened_at ?? '',
            summary.timestamp_of_close ?? '',
            summary.total_votes,
            summary.election_reached_at ?? '',
            summary.winner_label ?? '',
            choice.label,
            choice.votes,
            (Number(choice.pct ?? 0) * 100).toFixed(2),
            choice.is_withdrawn ? 'true' : 'false'
          ].map(csvCell).join(','))
        }
      }

      const csv = rows.join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${eventName.replace(/\s+/g, '-').toLowerCase() || 'event'}-results-export.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed'
      if (/function .*export_event_results_admin.* does not exist/i.test(message)) {
        setError('Export failed: database migration for export RPC is missing. Apply the latest Supabase migrations and retry.')
      } else {
        setError(message)
      }
    } finally {
      setExporting(false)
    }
  }

  return (
    <main className="event-page">
      <section className="event-container">
        <Link to="/admin" className="back-link">&larr; Back to Admin</Link>
        <h1>{eventName || 'Event'}</h1>
        <p className="subtitle">
          Manage ballots and delegate PINs.
          {votingStaffNames ? <><br />Voting Team: {votingStaffNames}</> : null}
        </p>
        {error && <p className="error">{error}</p>}

        <div className={`accordion ${editOpen ? 'active' : ''}`}>
          <button type="button" className="accordion-header" onClick={() => setEditOpen((v) => !v)}>
            Edit Event
            <span className="accordion-icon">&#9654;</span>
          </button>
          <div className="accordion-content">
            <form onSubmit={onUpdateEvent} className="stack">
              <label>
                Event name
                <input value={eventName} onChange={(e) => setEventName(e.target.value)} required />
              </label>
              <label>
                Event date
                <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
              </label>
              <label>
                Event location
                <input value={eventLocation} onChange={(e) => setEventLocation(e.target.value)} placeholder="Location" />
              </label>
              <label>
                Names running voting
                <input
                  value={votingStaffNames}
                  onChange={(e) => setVotingStaffNames(e.target.value)}
                  placeholder="Example: Yisrael Vincent"
                />
              </label>
              <button type="submit">Save Event Details</button>
            </form>
          </div>
        </div>

        <div className={`accordion ${pinsOpen ? 'active' : ''}`}>
          <button type="button" className="accordion-header" onClick={() => setPinsOpen((v) => !v)}>
            Manage PINs
            <span className="accordion-icon">&#9654;</span>
          </button>
          <div className="accordion-content">
            <p>Generate 4-digit PINs. Active PINs for this event: <strong>{activePins.length}</strong></p>
            <form className="pin-section" onSubmit={onGeneratePins}>
              <input
                className="pin-input"
                type="number"
                min={1}
                max={500}
                value={pinCount}
                onChange={(e) => setPinCount(Math.max(1, Math.min(Number(e.target.value), 500)))}
              />
              <button type="submit">Generate</button>
            </form>
            <button className="danger-btn" style={{ marginTop: '10px' }} onClick={onDeleteAllPins}>Delete All PINs</button>
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
          </div>
        </div>

        <h2>Ballots</h2>
        <p className="subtitle">Includes round summaries, counts per choice, and the timestamp each election threshold was first reached.</p>

        {ballots.map((ballot) => (
          <div className="ballot-item" key={ballot.id}>
            <div className="ballot-header">
              <span>{ballot.title}</span>
              <Link to={`/admin/ballots/${ballot.id}`}>
                <button className="secondary-btn">Manage</button>
              </Link>
            </div>
            <div className="ballot-details">
              Status: {ballot.status}<br />
              Incumbent: {ballot.incumbent_name || 'N/A'}<br />
              PIN required: {ballot.requires_pin ? 'Yes' : 'No'}<br />
              Vote URL: <span className="url">{appBase}/vote/{ballot.slug}</span><br />
              Display URL: <span className="url">{appBase}/display/{ballot.slug}</span>
            </div>
          </div>
        ))}

        <div className="ballot-item ballot-create-card">
          <div className="ballot-header">Create New Ballot</div>
          <form onSubmit={onCreateBallot} className="stack" style={{ marginTop: '15px' }}>
            <label>
              Ballot title
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ballot title" required />
            </label>
            <label>
              Description
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
            </label>
            <label>
              Incumbent name
              <input
                value={incumbentName}
                onChange={(e) => setIncumbentName(e.target.value)}
                placeholder="Incumbent name (optional)"
              />
            </label>
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
            <label className="checkbox-label">
              <input type="checkbox" checked={requiresPin} onChange={(e) => setRequiresPin(e.target.checked)} />
              Require PIN for this ballot
            </label>
            <button type="submit" style={{ marginTop: '10px' }}>Create Ballot</button>
          </form>
        </div>

        <div className="export-section">
          <button className="secondary-btn" onClick={onExportResults} disabled={exporting}>
            {exporting ? 'Exporting...' : 'Export All Voting Results (CSV)'}
          </button>
          <p className="subtitle" style={{ marginTop: '10px' }}>
            Download aggregated round results and threshold timestamps for record keeping.
          </p>
        </div>
      </section>
    </main>
  )
}
