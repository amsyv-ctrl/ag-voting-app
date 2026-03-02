import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import QRCode from 'qrcode'
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
  const [voteQrDataUrl, setVoteQrDataUrl] = useState<string | null>(null)

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

  useEffect(() => {
    if (!ballot?.slug) {
      setVoteQrDataUrl(null)
      return
    }
    QRCode.toDataURL(`${window.location.origin}/vote/${ballot.slug}`, { width: 1024, margin: 1 })
      .then(setVoteQrDataUrl)
      .catch(() => setVoteQrDataUrl(null))
  }, [ballot?.slug])

  if (!ballot || !results) return <main className="display-page"><p>Loading...</p></main>

  const rows = [...results.rows].sort((a, b) => b.votes - a.votes)
  const showWinner = results.ballot_status === 'CLOSED' && !!results.winner_label

  return (
    <main className="display-page">
      <section className="display-main">
        <h1 className="display-event">{ballot.event_name}</h1>
        <p className="display-ballot-title">{ballot.title}</p>
        <p className="display-status">Current Vote: #{results.vote_round} ({roundLabel(results.vote_round)} vote)</p>
        <p className="display-status">Total Votes: {results.total_votes}</p>
        {secondsToClose !== null && <p className="display-status display-close">Closing in: {secondsToClose}s</p>}

        {results.hidden_until_closed ? (
          <p className="display-no-winner">Results hidden until ballot is closed.</p>
        ) : showWinner ? (
          <div className="display-winner-wrap">
            <p className="display-winner-kicker">Election Reached</p>
            <p className="display-winner-name">{results.winner_label}</p>
          </div>
        ) : (
          <p className="display-no-winner">No winner yet{results.has_tie ? ' (tie)' : ''}</p>
        )}

        <section className="display-results">
          {results.hidden_until_closed ? (
            <article className="display-hidden-state">
              <p>Voting in progress</p>
              <p>Live results hidden</p>
            </article>
          ) : (
            rows.map((row) => {
              const pctText = (row.pct * 100).toFixed(1)
              return (
                <article key={row.choice_id} className="display-bar-container">
                  <div className="display-bar-label">
                    <span>{row.label}</span>
                    <span>
                      {row.votes} votes ({pctText}%)
                    </span>
                  </div>
                  <div className="display-bar-track">
                    <div className="display-bar-fill" style={{ width: `${pctText}%` }} />
                  </div>
                </article>
              )
            })
          )}
        </section>
      </section>

      <section className="display-qr-section">
        <h2>Scan to Vote</h2>
        {voteQrDataUrl ? (
          <img className="display-qr" src={voteQrDataUrl} alt="QR code for ballot voting link" />
        ) : (
          <p>Generating QR code...</p>
        )}
        <p className="display-vote-url">{window.location.origin}/vote/{ballot.slug}</p>
      </section>
    </main>
  )
}
