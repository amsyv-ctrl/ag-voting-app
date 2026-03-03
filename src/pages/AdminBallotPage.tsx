import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { roundLabel } from '../lib/roundLabel'
import { supabase } from '../lib/supabase'
import { computeWinner } from '../lib/winner'
import type { BallotResults } from '../types'

type BallotData = {
  id: string
  event_id: string
  event_name: string
  slug: string
  title: string
  incumbent_name: string | null
  description: string | null
  status: 'DRAFT' | 'OPEN' | 'CLOSED'
  majority_rule: 'SIMPLE' | 'TWO_THIRDS'
  opens_at: string | null
  closes_at: string | null
  vote_round: number
  requires_pin: boolean
  results_visibility: 'LIVE' | 'CLOSED_ONLY' | null
}

type ChoiceRow = {
  id: string
  label: string
  sort_order: number
  is_withdrawn: boolean
  withdrawn_at: string | null
}
type RoundHistory = {
  round: number
  total_votes: number
  winner_label: string | null
  rows: Array<{ choice_id: string; label: string; votes: number; pct: number; is_withdrawn?: boolean }>
}

export function AdminBallotPage() {
  const { id } = useParams()
  const ballotId = id as string
  const navigate = useNavigate()

  const [ballot, setBallot] = useState<BallotData | null>(null)
  const [choices, setChoices] = useState<ChoiceRow[]>([])
  const [results, setResults] = useState<BallotResults | null>(null)
  const [roundHistory, setRoundHistory] = useState<RoundHistory[]>([])
  const [newChoice, setNewChoice] = useState('')
  const [editingChoiceId, setEditingChoiceId] = useState<string | null>(null)
  const [editingChoiceLabel, setEditingChoiceLabel] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editIncumbentName, setEditIncumbentName] = useState('')
  const [voteQrDataUrl, setVoteQrDataUrl] = useState<string | null>(null)
  const [secondsToClose, setSecondsToClose] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const closeFinalizeInFlight = useRef(false)
  const [activeSection, setActiveSection] = useState<'edit' | 'controls' | 'choices' | 'results' | 'history' | 'danger' | null>('controls')

  const appBase = useMemo(() => window.location.origin, [])

  function toggleSection(section: 'edit' | 'controls' | 'choices' | 'results' | 'history' | 'danger') {
    setActiveSection((current) => (current === section ? null : section))
  }

  async function load() {
    setLoading(true)
    setError(null)
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) {
      navigate('/admin')
      setLoading(false)
      return
    }

    const { data: ballotData, error: ballotError } = await supabase
      .from('ballots')
      .select('id,event_id,slug,title,incumbent_name,description,status,majority_rule,opens_at,closes_at,vote_round,requires_pin,results_visibility')
      .eq('id', ballotId)
      .single()

    if (ballotError || !ballotData) {
      setError(ballotError?.message ?? 'Unable to load ballot')
      setLoading(false)
      return
    }

    const { data: choiceData, error: choiceError } = await supabase
      .from('choices')
      .select('id,label,sort_order,is_withdrawn,withdrawn_at')
      .eq('ballot_id', ballotId)
      .order('sort_order', { ascending: true })

    if (choiceError) {
      setError(choiceError.message)
      setLoading(false)
      return
    }

    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('name')
      .eq('id', ballotData.event_id)
      .single()

    if (eventError) {
      setError(eventError.message)
      setLoading(false)
      return
    }

    setBallot({
      id: ballotData.id,
      event_id: ballotData.event_id,
      event_name: eventData.name ?? 'Event',
      slug: ballotData.slug,
      title: ballotData.title,
      incumbent_name: ballotData.incumbent_name,
      description: ballotData.description,
      status: ballotData.status,
      majority_rule: ballotData.majority_rule,
      opens_at: ballotData.opens_at,
      closes_at: ballotData.closes_at,
      vote_round: ballotData.vote_round ?? 1,
      requires_pin: ballotData.requires_pin ?? true,
      results_visibility: ballotData.results_visibility ?? null
    })
    setEditTitle(ballotData.title ?? '')
    setEditDescription(ballotData.description ?? '')
    setEditIncumbentName(ballotData.incumbent_name ?? '')
    setChoices(choiceData ?? [])
    await loadResults(ballotData.slug)
    await loadRoundHistory(ballotData.id, ballotData.majority_rule, ballotData.vote_round ?? 1)
    setLoading(false)
  }

  async function loadResults(slug: string) {
    const { data, error: rpcError } = await supabase.rpc('get_ballot_results_public', { p_slug: slug })
    if (rpcError || !data) {
      setError(rpcError?.message ?? 'Unable to load results')
      return
    }
    setResults(computeWinner(data as BallotResults))
  }

  async function loadRoundHistory(
    currentBallotId: string,
    majorityRule: 'SIMPLE' | 'TWO_THIRDS',
    currentRound: number
  ) {
    const { data, error: historyError } = await supabase.rpc('get_ballot_round_history_admin', {
      p_ballot_id: currentBallotId
    })

    if (historyError || !data) {
      setError(historyError?.message ?? 'Unable to load round history')
      return
    }

    const rounds = Array.isArray((data as { rounds?: unknown[] }).rounds)
      ? ((data as { rounds: Array<{ vote_round: number; total_votes: number; rows: Array<{ choice_id: string; label: string; votes: number; pct: number; is_withdrawn?: boolean }> }> }).rounds)
      : []

    const history: RoundHistory[] = []
    for (const roundData of rounds) {
      const round = Math.max(1, Number(roundData.vote_round ?? 1))
      if (round === currentRound) continue

      const resultLike: BallotResults = {
        ballot_id: currentBallotId,
        vote_round: round,
        total_votes: Number(roundData.total_votes ?? 0),
        rows: roundData.rows.map((r) => ({
          choice_id: r.choice_id,
          label: r.label,
          votes: Number(r.votes ?? 0),
          pct: Number(r.pct ?? 0)
        })),
        winner_choice_id: null,
        winner_label: null,
        top_pct: null,
        has_tie: false,
        majority_rule: majorityRule
      }

      const computed = computeWinner(resultLike)
      history.push({
        round,
        total_votes: computed.total_votes,
        winner_label: computed.winner_label,
        rows: roundData.rows
          .map((r) => ({
            choice_id: r.choice_id,
            label: r.label,
            votes: Number(r.votes ?? 0),
            pct: Number(r.pct ?? 0),
            is_withdrawn: !!r.is_withdrawn
          }))
          .sort((a, b) => b.votes - a.votes)
      })
    }

    history.sort((a, b) => b.round - a.round)
    setRoundHistory(history)
  }

  useEffect(() => {
    load()
  }, [ballotId])

  useEffect(() => {
    if (!ballot) return
    const channel = supabase
      .channel(`ballot-${ballot.id}-votes`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'votes', filter: `ballot_id=eq.${ballot.id}` },
        async () => {
          await loadResults(ballot.slug)
          await loadRoundHistory(ballot.id, ballot.majority_rule, ballot.vote_round)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [ballot?.id, ballot?.majority_rule, ballot?.vote_round])

  useEffect(() => {
    if (!ballot) return
    QRCode.toDataURL(`${window.location.origin}/vote/${ballot.slug}`, { width: 240, margin: 1 })
      .then(setVoteQrDataUrl)
      .catch(() => setVoteQrDataUrl(null))
  }, [ballot?.slug])

  useEffect(() => {
    if (!ballot?.closes_at) {
      setSecondsToClose(null)
      return
    }

    const tick = () => {
      const ms = new Date(ballot.closes_at as string).getTime() - Date.now()
      const sec = Math.ceil(ms / 1000)
      setSecondsToClose(sec > 0 ? sec : 0)
    }

    tick()
    const timer = window.setInterval(tick, 250)
    return () => window.clearInterval(timer)
  }, [ballot?.closes_at])

  useEffect(() => {
    if (!ballot || ballot.status !== 'OPEN' || secondsToClose !== 0 || closeFinalizeInFlight.current) return
    if (!ballot.closes_at || new Date(ballot.closes_at).getTime() > Date.now()) return
    closeFinalizeInFlight.current = true
    ;(async () => {
      try {
        const { error: updateError } = await supabase
          .from('ballots')
          .update({ status: 'CLOSED' })
          .eq('id', ballot.id)
        if (updateError) {
          setError(updateError.message)
        }
        await load()
      } finally {
        closeFinalizeInFlight.current = false
      }
    })()
  }, [ballot, secondsToClose])

  async function closeBallot() {
    if (!ballot) return
    if (!window.confirm(`Close ${roundLabel(ballot.vote_round)} vote for this ballot with a 10-second delay?`)) {
      return
    }
    const closeAtIso = new Date(Date.now() + 10_000).toISOString()
    const patch = { status: 'OPEN', closes_at: closeAtIso }

    const { error: updateError } = await supabase.from('ballots').update(patch).eq('id', ballot.id)
    if (updateError) {
      setError(updateError.message)
      return
    }
    await load()
  }

  async function openNewVoteRound() {
    if (!ballot) return
    if (!ballot.results_visibility) {
      setError('Choose results visibility (Show live voting or Hide until ballot is closed) before opening a vote.')
      return
    }
    const nextRound = ballot.status === 'DRAFT' ? 1 : (ballot.vote_round ?? 1) + 1
    if (!window.confirm(`Open ${roundLabel(nextRound)} vote for this ballot?`)) {
      return
    }
    const nowIso = new Date().toISOString()
    const patch = { status: 'OPEN', vote_round: nextRound, opens_at: nowIso, closes_at: null as string | null }
    const { error: updateError } = await supabase.from('ballots').update(patch).eq('id', ballot.id)
    if (updateError) {
      setError(updateError.message)
      return
    }
    await load()
  }

  async function setResultsVisibility(mode: 'LIVE' | 'CLOSED_ONLY') {
    if (!ballot) return
    const { error: updateError } = await supabase
      .from('ballots')
      .update({ results_visibility: mode })
      .eq('id', ballot.id)
    if (updateError) {
      setError(updateError.message)
      return
    }
    await load()
  }

  async function deleteBallot() {
    if (!ballot) return
    if (!window.confirm(`Are you sure you want to delete ballot "${ballot.title}"? This cannot be undone.`)) {
      return
    }
    const { error: deleteError } = await supabase.from('ballots').delete().eq('id', ballot.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    navigate(`/admin/events/${ballot.event_id}`)
  }

  async function togglePinRequirement(nextValue: boolean) {
    if (!ballot) return
    const { error: updateError } = await supabase
      .from('ballots')
      .update({ requires_pin: nextValue })
      .eq('id', ballot.id)
    if (updateError) {
      setError(updateError.message)
      return
    }
    await load()
  }

  async function onSaveBallotDetails(e: FormEvent) {
    e.preventDefault()
    if (!ballot) return
    setError(null)

    const { error: updateError } = await supabase
      .from('ballots')
      .update({
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        incumbent_name: editIncumbentName.trim() || null
      })
      .eq('id', ballot.id)

    if (updateError) {
      setError(updateError.message)
      return
    }

    await load()
  }

  async function onAddChoice(e: FormEvent) {
    e.preventDefault()
    if (!ballot || !newChoice.trim()) return

    const nextOrder = choices.length + 1
    const { error: insertError } = await supabase
      .from('choices')
      .insert({ ballot_id: ballot.id, label: newChoice.trim(), sort_order: nextOrder, is_withdrawn: false })

    if (insertError) {
      setError(insertError.message)
      return
    }

    setNewChoice('')
    await load()
  }

  function startEditChoice(choice: ChoiceRow) {
    setEditingChoiceId(choice.id)
    setEditingChoiceLabel(choice.label)
  }

  function cancelEditChoice() {
    setEditingChoiceId(null)
    setEditingChoiceLabel('')
  }

  async function saveChoiceLabel(choiceId: string) {
    const nextLabel = editingChoiceLabel.trim()
    if (!nextLabel) {
      setError('Choice label cannot be empty')
      return
    }
    const { error: updateError } = await supabase.from('choices').update({ label: nextLabel }).eq('id', choiceId)
    if (updateError) {
      setError(updateError.message)
      return
    }
    cancelEditChoice()
    await load()
  }

  async function toggleChoiceWithdraw(choice: ChoiceRow) {
    const nextWithdrawn = !choice.is_withdrawn
    const message = nextWithdrawn
      ? `Mark "${choice.label}" as withdrawn? It will be hidden from voter and public results pages.`
      : `Restore "${choice.label}" so it appears in voter and public results pages again?`

    if (!window.confirm(message)) return

    const payload = nextWithdrawn
      ? { is_withdrawn: true, withdrawn_at: new Date().toISOString() }
      : { is_withdrawn: false, withdrawn_at: null as string | null }

    const { error: updateError } = await supabase.from('choices').update(payload).eq('id', choice.id)
    if (updateError) {
      setError(updateError.message)
      return
    }

    await load()
  }

  if (loading && !ballot) {
    return <main className="ballot-admin-page"><p>Loading ballot...</p></main>
  }

  if (!ballot) {
    return (
      <main className="ballot-admin-page">
        <section className="ballot-admin-card">
          <h1>Unable to load ballot</h1>
          {error && <p className="error">{error}</p>}
          <div className="inline">
            <button onClick={() => load()}>Retry</button>
            <Link to="/admin">Back to admin</Link>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="ballot-admin-page">
      <section className="ballot-admin-card ballot-admin-hero">
        <h1>{ballot.event_name}</h1>
        <h2>{ballot.title}</h2>
        <p className="ballot-admin-info">Current Vote: #{ballot.vote_round} ({roundLabel(ballot.vote_round)} vote)</p>
        <p className="ballot-admin-info">Status: <strong>{ballot.status}</strong></p>
        <p className="ballot-admin-info">PIN Required: {ballot.requires_pin ? 'Yes' : 'No'}</p>
        {ballot.incumbent_name && <p className="ballot-admin-info">Incumbent: {ballot.incumbent_name}</p>}
        <p className="ballot-admin-description">{ballot.description || 'No description'}</p>
        {secondsToClose !== null && (
          <p><strong>Closing in: {secondsToClose}s</strong></p>
        )}
        <p className="ballot-admin-url">Vote URL: {appBase}/vote/{ballot.slug}</p>
        <p className="ballot-admin-url">Display URL: {appBase}/display/{ballot.slug}</p>
        {voteQrDataUrl && <img className="ballot-admin-qr" src={voteQrDataUrl} alt="Ballot QR code" width={180} height={180} />}
        <Link to={`/admin/events/${ballot.event_id}`}>Back to event</Link>
        {error && <p className="error">{error}</p>}
      </section>

      <section className={`accordion ${activeSection === 'edit' ? 'active' : ''}`}>
        <button type="button" className="accordion-header" onClick={() => toggleSection('edit')}>
          Edit Ballot Details
          <span className="accordion-icon">&#9654;</span>
        </button>
        <div className="accordion-content">
          <form onSubmit={onSaveBallotDetails} className="stack" style={{ marginTop: '0.8rem' }}>
            <label>
              Vote name
              <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required />
            </label>
            <label>
              Ballot description
              <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
            </label>
            <label>
              Incumbent name
              <input
                value={editIncumbentName}
                onChange={(e) => setEditIncumbentName(e.target.value)}
                placeholder="Incumbent name (optional)"
              />
            </label>
            <button type="submit">Save Ballot Details</button>
          </form>
        </div>
      </section>

      <section className={`accordion ${activeSection === 'controls' ? 'active' : ''}`}>
        <button type="button" className="accordion-header" onClick={() => toggleSection('controls')}>
          Vote Controls
          <span className="accordion-icon">&#9654;</span>
        </button>
        <div className="accordion-content">
          <label className="inline">
            <input
              type="checkbox"
              checked={ballot.requires_pin}
              onChange={(e) => togglePinRequirement(e.target.checked)}
            />
            Require PIN for this vote
          </label>
          <fieldset>
            <legend>Results visibility (required before opening vote)</legend>
            <label className="radio-row">
              <input
                type="radio"
                name="resultsVisibility"
                checked={ballot.results_visibility === 'LIVE'}
                onChange={() => setResultsVisibility('LIVE')}
              />
              Show live voting
            </label>
            <label className="radio-row">
              <input
                type="radio"
                name="resultsVisibility"
                checked={ballot.results_visibility === 'CLOSED_ONLY'}
                onChange={() => setResultsVisibility('CLOSED_ONLY')}
              />
              Hide results until ballot is closed
            </label>
          </fieldset>
          <div className="inline ballot-admin-actions">
            {ballot.status === 'OPEN' ? (
              <button className="secondary" onClick={closeBallot}>Close current vote (10s delay)</button>
            ) : (
              <button onClick={openNewVoteRound}>
                {ballot.status === 'DRAFT' ? 'Open Vote #1' : `Open Vote #${(ballot.vote_round ?? 1) + 1}`}
              </button>
            )}
          </div>
        </div>
      </section>

      <section className={`accordion ${activeSection === 'choices' ? 'active' : ''}`}>
        <button type="button" className="accordion-header" onClick={() => toggleSection('choices')}>
          Choices
          <span className="accordion-icon">&#9654;</span>
        </button>
        <div className="accordion-content">
          <form onSubmit={onAddChoice} className="stack inline">
            <input value={newChoice} onChange={(e) => setNewChoice(e.target.value)} placeholder="Choice label" />
            <button type="submit">Add</button>
          </form>
          <ul className="list">
            {choices.map((choice) => (
              <li key={choice.id} className={`choice-item ${choice.is_withdrawn ? 'choice-item-withdrawn' : ''}`}>
                <div className="choice-main">
                  <span className="choice-order">{choice.sort_order}.</span>
                  {editingChoiceId === choice.id ? (
                    <input
                      value={editingChoiceLabel}
                      onChange={(e) => setEditingChoiceLabel(e.target.value)}
                      aria-label={`Edit label for ${choice.label}`}
                    />
                  ) : (
                    <span className={`choice-label ${choice.is_withdrawn ? 'choice-label-withdrawn' : ''}`}>
                      {choice.label}
                      {choice.is_withdrawn ? ' (withdrawn)' : ''}
                    </span>
                  )}
                </div>
                <div className="choice-actions">
                  {editingChoiceId === choice.id ? (
                    <>
                      <button type="button" onClick={() => saveChoiceLabel(choice.id)}>Save</button>
                      <button type="button" className="secondary" onClick={cancelEditChoice}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => startEditChoice(choice)}>Edit</button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => toggleChoiceWithdraw(choice)}
                      >
                        {choice.is_withdrawn ? 'Restore' : 'Withdraw'}
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={`accordion ${activeSection === 'results' ? 'active' : ''}`}>
        <button type="button" className="accordion-header" onClick={() => toggleSection('results')}>
          Live Results
          <span className="accordion-icon">&#9654;</span>
        </button>
        <div className="accordion-content">
          <p><strong>Showing Vote:</strong> #{results?.vote_round ?? ballot.vote_round}</p>
          {results?.winner_label && (
            <div className="winner-banner">
              <p className="winner-kicker">Election Reached</p>
              <h3>{results.winner_label}</h3>
              <p>{(results.top_pct! * 100).toFixed(1)}% of votes</p>
            </div>
          )}
          {!results || results.total_votes === 0 ? (
            <p>No votes yet.</p>
          ) : (
            <>
              <p>Total votes: {results.total_votes}</p>
              {results.winner_label ? (
                <p className="winner">Winner: {results.winner_label} ({(results.top_pct! * 100).toFixed(1)}%)</p>
              ) : (
                <p className="muted">No winner yet{results.has_tie ? ' (tie)' : ''}.</p>
              )}
              <table>
                <thead>
                  <tr><th>Choice</th><th>Votes</th><th>%</th></tr>
                </thead>
                <tbody>
                  {[...results.rows].sort((a, b) => b.votes - a.votes).map((row) => (
                    <tr key={row.choice_id}>
                      <td>{row.label}</td>
                      <td>{row.votes}</td>
                      <td>{(row.pct * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </section>

      {roundHistory.length > 0 && (
        <section className={`accordion ${activeSection === 'history' ? 'active' : ''}`}>
          <button type="button" className="accordion-header" onClick={() => toggleSection('history')}>
            Previous Vote Rounds
            <span className="accordion-icon">&#9654;</span>
          </button>
          <div className="accordion-content">
            {roundHistory.map((round) => (
              <div key={round.round} className="ballot-admin-round-card">
                <p><strong>Vote #{round.round}</strong> · Total votes: {round.total_votes}</p>
                {round.winner_label ? (
                  <p className="winner">Winner: {round.winner_label}</p>
                ) : (
                  <p className="muted">No winner reached in this vote.</p>
                )}
                <table>
                  <thead>
                    <tr><th>Choice</th><th>Votes</th><th>%</th></tr>
                  </thead>
                  <tbody>
                    {round.rows.map((row) => (
                      <tr key={`${round.round}-${row.choice_id}`} className={row.is_withdrawn ? 'choice-item-withdrawn' : ''}>
                        <td>{row.label}</td>
                        <td>{row.votes}</td>
                        <td>{(row.pct * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={`accordion ${activeSection === 'danger' ? 'active' : ''}`}>
        <button type="button" className="accordion-header" onClick={() => toggleSection('danger')}>
          Danger Zone
          <span className="accordion-icon">&#9654;</span>
        </button>
        <div className="accordion-content">
          <p className="error">Delete this ballot and all of its votes.</p>
          <button className="secondary" onClick={deleteBallot}>Delete ballot</button>
        </div>
      </section>
    </main>
  )
}
