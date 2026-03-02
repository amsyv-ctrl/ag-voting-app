import { FormEvent, useMemo, useState, useEffect } from 'react'
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

type ExportVoteRow = {
  ballot_id: string
  choice_id: string
  vote_round: number
  created_at: string
}

type ExportBallotRow = {
  id: string
  title: string
  slug: string
  majority_rule: 'SIMPLE' | 'TWO_THIRDS'
  status: 'DRAFT' | 'OPEN' | 'CLOSED'
}

type ExportChoiceRow = {
  id: string
  ballot_id: string
  label: string
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

  function determineWinnerChoiceId(counts: Map<string, number>, total: number, rule: 'SIMPLE' | 'TWO_THIRDS') {
    if (total <= 0 || counts.size === 0) return null
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
    const topVotes = sorted[0][1]
    const topChoices = sorted.filter(([, v]) => v === topVotes)
    if (topChoices.length > 1) return null

    const pct = topVotes / total
    const passes = rule === 'SIMPLE' ? pct > 0.5 : pct >= 2 / 3
    return passes ? sorted[0][0] : null
  }

  async function onExportResults() {
    setError(null)
    setExporting(true)
    try {
      const { data: ballotsData, error: ballotsError } = await supabase
        .from('ballots')
        .select('id,title,slug,majority_rule,status')
        .eq('event_id', eventId)

      if (ballotsError) throw ballotsError
      const ballots = (ballotsData ?? []) as ExportBallotRow[]
      const ballotIds = ballots.map((b) => b.id)

      const { data: choicesData, error: choicesError } = await supabase
        .from('choices')
        .select('id,ballot_id,label')
        .in('ballot_id', ballotIds.length > 0 ? ballotIds : ['00000000-0000-0000-0000-000000000000'])

      if (choicesError) throw choicesError
      const choices = (choicesData ?? []) as ExportChoiceRow[]

      const { data: votesData, error: votesError } = await supabase
        .from('votes')
        .select('ballot_id,choice_id,vote_round,created_at')
        .in('ballot_id', ballotIds.length > 0 ? ballotIds : ['00000000-0000-0000-0000-000000000000'])
        .order('created_at', { ascending: true })

      if (votesError) throw votesError
      const votes = (votesData ?? []) as ExportVoteRow[]

      const choiceLabel = new Map(choices.map((c) => [c.id, c.label]))
      const votesByBallotRound = new Map<string, ExportVoteRow[]>()
      for (const vote of votes) {
        const key = `${vote.ballot_id}:${vote.vote_round}`
        const arr = votesByBallotRound.get(key) ?? []
        arr.push(vote)
        votesByBallotRound.set(key, arr)
      }

      const roundSummaries: Array<Record<string, unknown>> = []
      for (const ballot of ballots) {
        const rounds = Array.from(votesByBallotRound.keys())
          .filter((k) => k.startsWith(`${ballot.id}:`))
          .map((k) => Number(k.split(':')[1]))
          .sort((a, b) => a - b)

        for (const round of rounds) {
          const key = `${ballot.id}:${round}`
          const roundVotes = votesByBallotRound.get(key) ?? []
          const counts = new Map<string, number>()
          let winnerReachedAt: string | null = null
          let runningTotal = 0

          for (const vote of roundVotes) {
            runningTotal += 1
            counts.set(vote.choice_id, (counts.get(vote.choice_id) ?? 0) + 1)
            const winnerAtThisVote = determineWinnerChoiceId(counts, runningTotal, ballot.majority_rule)
            if (!winnerReachedAt && winnerAtThisVote) {
              winnerReachedAt = vote.created_at
            }
          }

          const totalVotes = roundVotes.length
          const finalWinnerChoiceId = determineWinnerChoiceId(counts, totalVotes, ballot.majority_rule)
          roundSummaries.push({
            ballot_id: ballot.id,
            ballot_title: ballot.title,
            ballot_slug: ballot.slug,
            vote_round: round,
            majority_rule: ballot.majority_rule,
            total_votes: totalVotes,
            election_reached_at: winnerReachedAt,
            winner_choice_id: finalWinnerChoiceId,
            winner_label: finalWinnerChoiceId ? (choiceLabel.get(finalWinnerChoiceId) ?? null) : null,
            status: ballot.status
          })
        }
      }

      const voteLog = votes.map((vote) => ({
        ballot_id: vote.ballot_id,
        vote_round: vote.vote_round,
        choice_id: vote.choice_id,
        choice_label: choiceLabel.get(vote.choice_id) ?? null,
        created_at: vote.created_at
      }))

      const payload = {
        exported_at: new Date().toISOString(),
        event: {
          id: eventId,
          name: eventName,
          date: eventDate || null,
          location: eventLocation || null,
          voting_staff_names: votingStaffNames || null
        },
        summaries: roundSummaries,
        votes: voteLog
      }

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${eventName.replace(/\s+/g, '-').toLowerCase() || 'event'}-results-export.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
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
        <p className="subtitle">Includes every vote record and the timestamp each election threshold was first reached when exported.</p>

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
            {exporting ? 'Exporting...' : 'Export All Voting Results'}
          </button>
          <p className="subtitle" style={{ marginTop: '10px' }}>
            Download full vote records including timestamps for when each threshold was reached.
          </p>
        </div>
      </section>
    </main>
  )
}
