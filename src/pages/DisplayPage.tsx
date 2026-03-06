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
  const isClosed = results.ballot_status === 'CLOSED'
  const shouldHideResults = results.hidden_until_closed === true
  const showWinner = isClosed && !!results.winner_label
  const requiredVotes = results.total_votes === 0
    ? 0
    : results.majority_rule === 'SIMPLE'
      ? Math.floor(results.total_votes / 2) + 1
      : Math.ceil((results.total_votes * 2) / 3)
  const requiredRuleLabel = results.majority_rule === 'SIMPLE' ? 'Simple majority' : 'Two-thirds majority'

  return (
    <main className="display-page">
      <div className="display-grid">
        <section className="display-main">
          <p className="vote-kicker">MinistryVote Display</p>
          <h1 className="display-event">{ballot.event_name}</h1>
          <p className="display-ballot-title">{ballot.title}</p>
          <div className="display-meta-grid">
            <p className="display-meta-pill">Vote #{results.vote_round} ({roundLabel(results.vote_round)} vote)</p>
            <p className="display-meta-pill">PIN Required: {ballot.requires_pin ? 'Yes' : 'No'}</p>
            <p className="display-meta-pill">Total Votes: {results.total_votes}</p>
            {ballot.incumbent_name && <p className="display-meta-pill">Incumbent: {ballot.incumbent_name}</p>}
            {isClosed && <p className="display-meta-pill">This round is closed</p>}
            {secondsToClose !== null && <p className="display-meta-pill display-meta-pill-urgent">Closing in: {secondsToClose}s</p>}
          </div>

          {shouldHideResults ? (
            <p className="display-hidden-note">Results hidden until ballot is closed.</p>
          ) : (
            <p className="display-threshold">
              Votes cast: <strong>{results.total_votes}</strong> | Needed for election:{' '}
              <strong>{requiredVotes}</strong> ({requiredRuleLabel})
            </p>
          )}
          {showWinner && !shouldHideResults && (
            <div className="display-winner-wrap">
              <p className="display-winner-kicker">Election Reached</p>
              <p className="display-winner-name">{results.winner_label}</p>
            </div>
          )}
          {isClosed && !shouldHideResults && !results.winner_label && (
            <div className="display-winner-wrap">
              <p className="display-winner-kicker">No Election Reached</p>
              <p className="display-winner-name">No candidate met the required threshold.</p>
            </div>
          )}

          <section className="display-results">
            {shouldHideResults ? (
              <article className="display-hidden-state">
                <p>Voting in progress</p>
                <p>Results are hidden until this vote is closed.</p>
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
          {isClosed && <p className="display-hidden-note">This ballot is currently closed for voting.</p>}
          {voteQrDataUrl ? (
            <img className="display-qr" src={voteQrDataUrl} alt="QR code for ballot voting link" />
          ) : (
            <p>Generating QR code...</p>
          )}
          <p className="display-vote-url">{window.location.origin}/vote/{ballot.slug}</p>
        </section>
      </div>
    </main>
  )
}
