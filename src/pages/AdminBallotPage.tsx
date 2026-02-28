import { FormEvent, useEffect, useMemo, useState } from 'react'
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
  description: string | null
  status: 'DRAFT' | 'OPEN' | 'CLOSED'
  majority_rule: 'SIMPLE' | 'TWO_THIRDS'
  opens_at: string | null
  closes_at: string | null
  vote_round: number
}

export function AdminBallotPage() {
  const { id } = useParams()
  const ballotId = id as string
  const navigate = useNavigate()

  const [ballot, setBallot] = useState<BallotData | null>(null)
  const [choices, setChoices] = useState<Array<{ id: string; label: string; sort_order: number }>>([])
  const [results, setResults] = useState<BallotResults | null>(null)
  const [newChoice, setNewChoice] = useState('')
  const [voteQrDataUrl, setVoteQrDataUrl] = useState<string | null>(null)
  const [showRoundActionModal, setShowRoundActionModal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const appBase = useMemo(() => window.location.origin, [])

  async function load() {
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) {
      navigate('/admin')
      return
    }

    const { data: ballotData, error: ballotError } = await supabase
      .from('ballots')
      .select('id,event_id,slug,title,description,status,majority_rule,opens_at,closes_at,vote_round,events(name)')
      .eq('id', ballotId)
      .single()

    if (ballotError || !ballotData) {
      setError(ballotError?.message ?? 'Unable to load ballot')
      return
    }

    const { data: choiceData, error: choiceError } = await supabase
      .from('choices')
      .select('id,label,sort_order')
      .eq('ballot_id', ballotId)
      .order('sort_order', { ascending: true })

    if (choiceError) {
      setError(choiceError.message)
      return
    }

    setBallot({
      id: ballotData.id,
      event_id: ballotData.event_id,
      event_name: eventNameFromJoin((ballotData as { events?: unknown }).events),
      slug: ballotData.slug,
      title: ballotData.title,
      description: ballotData.description,
      status: ballotData.status,
      majority_rule: ballotData.majority_rule,
      opens_at: ballotData.opens_at,
      closes_at: ballotData.closes_at,
      vote_round: ballotData.vote_round ?? 1
    })
    setChoices(choiceData ?? [])
    await loadResults(ballotData.slug)
  }

  async function loadResults(slug: string) {
    const { data, error: rpcError } = await supabase.rpc('get_ballot_results_public', { p_slug: slug })
    if (rpcError || !data) {
      setError(rpcError?.message ?? 'Unable to load results')
      return
    }
    setResults(computeWinner(data as BallotResults))
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
        () => loadResults(ballot.slug)
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [ballot?.id])

  useEffect(() => {
    if (!ballot) return
    QRCode.toDataURL(`${window.location.origin}/vote/${ballot.slug}`, { width: 240, margin: 1 })
      .then(setVoteQrDataUrl)
      .catch(() => setVoteQrDataUrl(null))
  }, [ballot?.slug])

  async function closeBallot() {
    if (!ballot) return
    if (!window.confirm(`Close ${roundLabel(ballot.vote_round)} vote for this ballot?`)) {
      return
    }
    const nowIso = new Date().toISOString()
    const patch = { status: 'CLOSED', closes_at: nowIso }

    const { error: updateError } = await supabase.from('ballots').update(patch).eq('id', ballot.id)
    if (updateError) {
      setError(updateError.message)
      return
    }
    await load()
  }

  async function openCurrentRound() {
    if (!ballot) return
    const nowIso = new Date().toISOString()
    const patch = { status: 'OPEN', opens_at: ballot.opens_at ?? nowIso, closes_at: null as string | null }
    const { error: updateError } = await supabase.from('ballots').update(patch).eq('id', ballot.id)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setShowRoundActionModal(false)
    await load()
  }

  async function startNextRound() {
    if (!ballot) return
    const nextRound = (ballot.vote_round ?? 1) + 1
    if (!window.confirm(`Start ${roundLabel(nextRound)} vote for this ballot now?`)) {
      return
    }
    const nowIso = new Date().toISOString()
    const patch = { status: 'OPEN', vote_round: nextRound, opens_at: nowIso, closes_at: null as string | null }
    const { error: updateError } = await supabase.from('ballots').update(patch).eq('id', ballot.id)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setShowRoundActionModal(false)
    await load()
  }

  async function onAddChoice(e: FormEvent) {
    e.preventDefault()
    if (!ballot || !newChoice.trim()) return

    const nextOrder = choices.length + 1
    const { error: insertError } = await supabase
      .from('choices')
      .insert({ ballot_id: ballot.id, label: newChoice.trim(), sort_order: nextOrder })

    if (insertError) {
      setError(insertError.message)
      return
    }

    setNewChoice('')
    await load()
  }

  if (!ballot) {
    return <main className="page"><p>Loading ballot...</p></main>
  }

  return (
    <main className="page">
      <section className="card">
        <h1>{ballot.event_name}</h1>
        <h2>{ballot.title}</h2>
        <p>{ballot.description || 'No description'}</p>
        <p>Status: <strong>{ballot.status}</strong></p>
        <p><strong>Vote Round:</strong> {roundLabel(ballot.vote_round)} vote</p>
        <p>Vote URL: {appBase}/vote/{ballot.slug}</p>
        <p>Display URL: {appBase}/display/{ballot.slug}</p>
        {voteQrDataUrl && <img src={voteQrDataUrl} alt="Ballot QR code" width={180} height={180} />}
        <div className="inline">
          <button onClick={() => setShowRoundActionModal(true)}>Open / Reopen ballot</button>
          <button className="secondary" onClick={closeBallot}>Close ballot</button>
        </div>
        {showRoundActionModal && (
          <div className="card">
            <h3>Ballot Opening Confirmation</h3>
            <p>Choose whether to open the current vote or move this ballot to the next vote round.</p>
            <div className="inline">
              <button onClick={openCurrentRound}>Open current ({roundLabel(ballot.vote_round)}) vote</button>
              <button className="secondary" onClick={startNextRound}>
                Close current and start {roundLabel((ballot.vote_round ?? 1) + 1)} vote
              </button>
              <button className="secondary" onClick={() => setShowRoundActionModal(false)}>Cancel</button>
            </div>
          </div>
        )}
        <Link to={`/admin/events/${ballot.event_id}`}>Back to event</Link>
        {error && <p className="error">{error}</p>}
      </section>

      <section className="card">
        <h2>Choices</h2>
        <form onSubmit={onAddChoice} className="stack inline">
          <input value={newChoice} onChange={(e) => setNewChoice(e.target.value)} placeholder="Choice label" />
          <button type="submit">Add</button>
        </form>
        <ul className="list">
          {choices.map((choice) => (
            <li key={choice.id}>{choice.sort_order}. {choice.label}</li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Live results</h2>
        <p><strong>Showing:</strong> {roundLabel(results?.vote_round ?? ballot.vote_round)} vote</p>
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
      </section>
    </main>
  )
}
  function eventNameFromJoin(eventsField: unknown): string {
    if (Array.isArray(eventsField)) {
      const first = eventsField[0] as { name?: string } | undefined
      return first?.name ?? 'Event'
    }
    if (eventsField && typeof eventsField === 'object') {
      const single = eventsField as { name?: string }
      return single.name ?? 'Event'
    }
    return 'Event'
  }
