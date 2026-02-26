import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchBallotPublic, fetchBallotResults } from '../lib/api'
import { computeWinner } from '../lib/winner'
import { supabase } from '../lib/supabase'
import type { BallotResults, PublicBallot } from '../types'

export function DisplayPage() {
  const { slug } = useParams()
  const ballotSlug = slug as string

  const [ballot, setBallot] = useState<PublicBallot | null>(null)
  const [results, setResults] = useState<BallotResults | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchBallotPublic(ballotSlug).then(setBallot).catch((e: Error) => setError(e.message))
    fetchBallotResults(ballotSlug).then((r) => setResults(computeWinner(r))).catch((e: Error) => setError(e.message))
  }, [ballotSlug])

  useEffect(() => {
    if (!ballot) return

    const poll = window.setInterval(() => {
      fetchBallotResults(ballotSlug)
        .then((r) => setResults(computeWinner(r)))
        .catch((e: Error) => setError(e.message))
    }, 2000)

    const channel = supabase
      .channel(`display-${ballot.ballot_id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'votes', filter: `ballot_id=eq.${ballot.ballot_id}` },
        () => {
          fetchBallotResults(ballotSlug)
            .then((r) => setResults(computeWinner(r)))
            .catch((e: Error) => setError(e.message))
        }
      )
      .subscribe()

    return () => {
      window.clearInterval(poll)
      supabase.removeChannel(channel)
    }
  }, [ballot?.ballot_id, ballotSlug])

  if (error) return <main className="display-page"><p className="error">{error}</p></main>
  if (!ballot || !results) return <main className="display-page"><p>Loading...</p></main>

  const rows = [...results.rows].sort((a, b) => b.votes - a.votes)

  return (
    <main className="display-page">
      <header>
        <h1>{ballot.title}</h1>
        <p>{ballot.event_name}</p>
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
