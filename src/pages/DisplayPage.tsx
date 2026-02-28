import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchBallotPublic, fetchBallotResults } from '../lib/api'
import { roundLabel } from '../lib/roundLabel'
import { computeWinner } from '../lib/winner'
import { supabase } from '../lib/supabase'
import type { BallotResults, PublicBallot } from '../types'

export function DisplayPage() {
  const { slug } = useParams()
  const ballotSlug = slug as string

  const [ballot, setBallot] = useState<PublicBallot | null>(null)
  const [results, setResults] = useState<BallotResults | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [secondsToClose, setSecondsToClose] = useState<number | null>(null)

  useEffect(() => {
    fetchBallotPublic(ballotSlug).then(setBallot).catch(() => null)
    fetchBallotResults(ballotSlug).then((r) => setResults(computeWinner(r))).catch((e: Error) => setError(e.message))
  }, [ballotSlug])

  useEffect(() => {
    if (!ballot) return

    const poll = window.setInterval(() => {
      fetchBallotPublic(ballotSlug)
        .then((data) => setBallot(data))
        .catch(() => {
          // Keep last known ballot for final display when closure expires.
        })

      fetchBallotResults(ballotSlug)
        .then((r) => setResults(computeWinner(r)))
        .catch(() => null)
    }, 2000)

    const channel = supabase
      .channel(`display-${ballot.ballot_id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'votes', filter: `ballot_id=eq.${ballot.ballot_id}` },
        () => {
          fetchBallotResults(ballotSlug)
            .then((r) => setResults(computeWinner(r)))
            .catch(() => null)
        }
      )
      .subscribe()

    return () => {
      window.clearInterval(poll)
      supabase.removeChannel(channel)
    }
  }, [ballot?.ballot_id, ballotSlug])

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

  if (!ballot || !results) return <main className="display-page"><p>Loading...</p></main>

  const rows = [...results.rows].sort((a, b) => b.votes - a.votes)

  return (
    <main className="display-page">
      <header>
        <h1>{ballot.event_name}</h1>
        <p>{ballot.title}</p>
        <p>Current Vote: #{results.vote_round} ({roundLabel(results.vote_round)} vote)</p>
        {secondsToClose !== null && (
          <p><strong>Closing in: {secondsToClose}s</strong></p>
        )}
        <p>Total Votes: {results.total_votes}</p>
        {results.winner_label ? (
          <p className="winner">Winner: {results.winner_label}</p>
        ) : (
          <p>No winner yet{results.has_tie ? ' (tie)' : ''}</p>
        )}
      </header>
      <section>
        {rows.map((row) => (
          <article key={row.choice_id} className="display-row">
            <h2>{row.label}</h2>
            <p>{row.votes} votes</p>
            <p>{(row.pct * 100).toFixed(1)}%</p>
          </article>
        ))}
      </section>
    </main>
  )
}
