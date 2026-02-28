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
  const [secondsToClose, setSecondsToClose] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const closeFinalizeInFlight = useRef(false)

  const appBase = useMemo(() => window.location.origin, [])

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
      .select('id,event_id,slug,title,description,status,majority_rule,opens_at,closes_at,vote_round')
      .eq('id', ballotId)
      .single()

    if (ballotError || !ballotData) {
      setError(ballotError?.message ?? 'Unable to load ballot')
      setLoading(false)
      return
    }

    const { data: choiceData, error: choiceError } = await supabase
      .from('choices')
      .select('id,label,sort_order')
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
      description: ballotData.description,
      status: ballotData.status,
      majority_rule: ballotData.majority_rule,
      opens_at: ballotData.opens_at,
      closes_at: ballotData.closes_at,
      vote_round: ballotData.vote_round ?? 1
    })
    setChoices(choiceData ?? [])
    await loadResults(ballotData.slug)
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

  if (loading && !ballot) {
    return <main className="page"><p>Loading ballot...</p></main>
  }

  if (!ballot) {
    return (
      <main className="page">
        <section className="card">
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
    <main className="page">
      <section className="card">
        <h1>{ballot.event_name}</h1>
        <h2>{ballot.title}</h2>
        <p>{ballot.description || 'No description'}</p>
        <p>Status: <strong>{ballot.status}</strong></p>
        <p><strong>Current Vote:</strong> #{ballot.vote_round} ({roundLabel(ballot.vote_round)} vote)</p>
        {secondsToClose !== null && (
          <p><strong>Closing in: {secondsToClose}s</strong></p>
        )}
        <p>Vote URL: {appBase}/vote/{ballot.slug}</p>
        <p>Display URL: {appBase}/display/{ballot.slug}</p>
        {voteQrDataUrl && <img src={voteQrDataUrl} alt="Ballot QR code" width={180} height={180} />}
        <div className="inline">
          {ballot.status === 'OPEN' ? (
            <button className="secondary" onClick={closeBallot}>Close current vote (10s delay)</button>
          ) : (
            <button onClick={openNewVoteRound}>
              {ballot.status === 'DRAFT' ? 'Open Vote #1' : `Open Vote #${(ballot.vote_round ?? 1) + 1}`}
            </button>
          )}
        </div>
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
        <p><strong>Showing Vote:</strong> #{results?.vote_round ?? ballot.vote_round}</p>
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
