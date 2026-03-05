import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { roundLabel } from '../lib/roundLabel'
import { supabase } from '../lib/supabase'
import { computeWinner } from '../lib/winner'
import type { BallotResults } from '../types'
import { OperatorRunbook } from '../components/OperatorRunbook'
import { getAccessToken } from '../lib/auth'
import { logElectionAudit, sealBallotRound } from '../lib/api'
import { AdminLayout } from '../components/AdminLayout'
import { PageHero } from '../components/PageHero'
import { InfoTip } from '../components/InfoTip'

type BallotData = {
  id: string
  event_id: string
  event_name: string
  slug: string
  title: string
  incumbent_name: string | null
  description: string | null
  status: 'DRAFT' | 'OPEN' | 'CLOSED' | 'MANUAL_FALLBACK'
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

type OrgAccessRow = {
  mode: 'DEMO' | 'TRIAL' | 'PAID'
  is_active: boolean
  trial_event_id: string | null
  trial_votes_used: number
  trial_votes_limit: number
}

type IntegritySealRow = {
  seal_short: string
  seal_hash: string
  total_votes: number
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
  const [manualNotes, setManualNotes] = useState('')
  const [manualCounts, setManualCounts] = useState<Record<string, string>>({})
  const [voteQrDataUrl, setVoteQrDataUrl] = useState<string | null>(null)
  const [secondsToClose, setSecondsToClose] = useState<number | null>(null)
  const [eligiblePins, setEligiblePins] = useState<number>(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [orgAccess, setOrgAccess] = useState<OrgAccessRow | null>(null)
  const closeFinalizeInFlight = useRef(false)
  const [activeSection, setActiveSection] = useState<'edit' | 'choices' | 'results' | 'manual' | 'history' | 'danger' | null>('edit')
  const [runoffDismissed, setRunoffDismissed] = useState(false)
  const [integritySeal, setIntegritySeal] = useState<IntegritySealRow | null>(null)

  const appBase = useMemo(() => window.location.origin, [])

  function toggleSection(section: 'edit' | 'choices' | 'results' | 'manual' | 'history' | 'danger') {
    setActiveSection((current) => (current === section ? null : section))
  }

  const isPaidActive = !!(orgAccess?.mode === 'PAID' && orgAccess?.is_active)
  const isTrialActiveForThisEvent = !!(
    orgAccess?.mode === 'TRIAL' &&
    orgAccess?.trial_event_id === ballot?.event_id &&
    (orgAccess?.trial_votes_used ?? 0) < (orgAccess?.trial_votes_limit ?? 0)
  )
  const canOperateEvent = isPaidActive || isTrialActiveForThisEvent
  const isReadOnly = !canOperateEvent

  function requireOperateAccess() {
    if (canOperateEvent) return true
    setError('Subscription inactive. This event is read-only.')
    return false
  }

  function thresholdLabel(rule: 'SIMPLE' | 'TWO_THIRDS') {
    return rule === 'TWO_THIRDS' ? '2/3 majority required' : 'Simple majority (>50%) required'
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
      .is('deleted_at', null)
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
      .select('name,org_id')
      .eq('id', ballotData.event_id)
      .single()

    if (eventError) {
      setError(eventError.message)
      setLoading(false)
      return
    }

    const { data: orgData, error: orgError } = await supabase
      .from('organizations')
      .select('mode,is_active,trial_event_id,trial_votes_used,trial_votes_limit')
      .eq('id', eventData.org_id)
      .single()

    if (orgError) {
      setError(orgError.message)
      setLoading(false)
      return
    }
    setOrgAccess(orgData as OrgAccessRow)

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
    const nextCounts: Record<string, string> = {}
    for (const choice of choiceData ?? []) {
      if (!choice.is_withdrawn) nextCounts[choice.id] = manualCounts[choice.id] ?? '0'
    }
    setManualCounts(nextCounts)

    const { data: sealData } = await supabase
      .from('election_result_seals')
      .select('seal_short,seal_hash,total_votes')
      .eq('ballot_id', ballotData.id)
      .eq('vote_round', ballotData.vote_round ?? 1)
      .maybeSingle()
    setIntegritySeal((sealData as IntegritySealRow | null) ?? null)

    const { count: pinCount, error: pinCountError } = await supabase
      .from('pins')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', ballotData.event_id)
      .eq('is_active', true)

    if (pinCountError) {
      setError(pinCountError.message)
      setLoading(false)
      return
    }
    setEligiblePins(pinCount ?? 0)

    await loadResults(ballotData.slug)
    await loadRoundHistory(ballotData.id, ballotData.majority_rule, ballotData.vote_round ?? 1, ballotData.status)
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
    currentRound: number,
    ballotStatus: 'DRAFT' | 'OPEN' | 'CLOSED' | 'MANUAL_FALLBACK'
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
    const excludeCurrentRound = ballotStatus === 'OPEN' || ballotStatus === 'MANUAL_FALLBACK'
    for (const roundData of rounds) {
      const round = Math.max(1, Number(roundData.vote_round ?? 1))
      if (excludeCurrentRound && round === currentRound) continue

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
          await loadRoundHistory(ballot.id, ballot.majority_rule, ballot.vote_round, ballot.status)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [ballot?.id, ballot?.majority_rule, ballot?.vote_round, ballot?.status])

  useEffect(() => {
    setRunoffDismissed(false)
  }, [ballot?.id, ballot?.vote_round, ballot?.status])

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
        } else {
          await sealRound(ballot.id, ballot.vote_round)
        }
        await load()
      } finally {
        closeFinalizeInFlight.current = false
      }
    })()
  }, [ballot, secondsToClose])

  async function sealRound(ballotId: string, round: number) {
    const token = await getAccessToken()
    if (!token) {
      setError('Session expired. Please sign in again.')
      return
    }
    try {
      const seal = await sealBallotRound(token, ballotId, round)
      setIntegritySeal({
        seal_short: seal.seal_short,
        seal_hash: seal.seal_hash,
        total_votes: seal.total_votes
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate integrity seal')
    }
  }

  async function closeBallot() {
    if (!ballot) return
    if (!requireOperateAccess()) return
    if (!window.confirm(
      `Are you sure?\n\nClosing this ballot will finalize results for ${roundLabel(ballot.vote_round)} vote after a 10-second delay.`
    )) {
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
    if (!requireOperateAccess()) return
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
    const token = await getAccessToken()
    if (token) {
      try {
        await logElectionAudit(token, {
          action: 'BALLOT_OPENED',
          event_id: ballot.event_id,
          ballot_id: ballot.id,
          metadata: { round: nextRound }
        })
      } catch {
        // Do not block operator flow on audit write failures.
      }
    }
    await load()
  }

  async function switchToManualFallbackMode() {
    if (!ballot) return
    if (!requireOperateAccess()) return
    const typed = window.prompt(
      `Type MANUAL to switch "${ballot.title}" into Manual Count Mode for ${roundLabel(ballot.vote_round)} vote.`
    )
    if (typed !== 'MANUAL') return

    const { error: updateError } = await supabase
      .from('ballots')
      .update({ status: 'MANUAL_FALLBACK', closes_at: null })
      .eq('id', ballot.id)

    if (updateError) {
      setError(updateError.message)
      return
    }
    setActiveSection('manual')
    await load()
  }

  async function finalizeManualRound(e: FormEvent) {
    e.preventDefault()
    if (!ballot) return
    if (!requireOperateAccess()) return
    if (ballot.status !== 'MANUAL_FALLBACK') {
      setError('Ballot must be in manual fallback mode before recording manual totals.')
      return
    }

    const counts = choices
      .filter((choice) => !choice.is_withdrawn)
      .map((choice) => ({
        choice_id: choice.id,
        votes: Math.max(0, Number.parseInt(manualCounts[choice.id] ?? '0', 10) || 0)
      }))

    const { error: rpcError } = await supabase.rpc('record_manual_round_result', {
      p_ballot_id: ballot.id,
      p_counts: counts,
      p_notes: manualNotes.trim() || null,
      p_closed_at: new Date().toISOString()
    })

    if (rpcError) {
      setError(rpcError.message)
      return
    }

    await sealRound(ballot.id, ballot.vote_round)
    await load()
  }

  async function setResultsVisibility(mode: 'LIVE' | 'CLOSED_ONLY') {
    if (!ballot) return
    if (!requireOperateAccess()) return
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
    if (!isPaidActive) {
      setError('Deleting ballots requires an active paid subscription.')
      return
    }
    const typed = window.prompt(
      `Type DELETE to archive ballot "${ballot.title}". It will be hidden from active lists but preserved for records.`
    )
    if (typed !== 'DELETE') {
      return
    }
    const { data: sessionData } = await supabase.auth.getSession()
    const { error: deleteError } = await supabase
      .from('ballots')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: sessionData.session?.user.id ?? null
      })
      .eq('id', ballot.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    navigate(`/admin/events/${ballot.event_id}`)
  }

  async function togglePinRequirement(nextValue: boolean) {
    if (!ballot) return
    if (!requireOperateAccess()) return
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
    if (!requireOperateAccess()) return
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
    if (!requireOperateAccess()) return

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
    if (!requireOperateAccess()) return
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
    if (!requireOperateAccess()) return
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
    return (
      <AdminLayout>
        <section className="ui-card"><p>Loading ballot...</p></section>
      </AdminLayout>
    )
  }

  if (!ballot) {
    return (
      <AdminLayout breadcrumb={['Events', 'Ballot']}>
        <section className="ui-card">
          <h1>Unable to load ballot</h1>
          {error && <p className="error">{error}</p>}
          <div className="inline">
            <button className="btn btn-primary" onClick={() => load()}>Retry</button>
            <Link to="/admin">Back to admin</Link>
          </div>
        </section>
      </AdminLayout>
    )
  }

  const stateLabel = ballot.status === 'OPEN'
    ? 'OPEN'
    : ballot.status === 'MANUAL_FALLBACK'
      ? 'MANUAL FALLBACK'
    : (results?.total_votes ?? 0) > 0
      ? 'ROUND COMPLETE'
      : 'CLOSED'

  const stateClass = ballot.status === 'OPEN'
    ? 'status-badge-open'
    : ballot.status === 'MANUAL_FALLBACK'
      ? 'status-badge-manual'
    : (results?.total_votes ?? 0) > 0
      ? 'status-badge-round-complete'
      : 'status-badge-closed'
  const canOpenVote = canOperateEvent && ballot.status !== 'OPEN' && ballot.status !== 'MANUAL_FALLBACK'
  const canCloseVote = canOperateEvent && ballot.status === 'OPEN'
  const openVoteLabel = ballot.status === 'DRAFT' ? 'Open Vote' : 'Open Next Vote'

  return (
    <AdminLayout
      breadcrumb={['Events', ballot.event_name, ballot.title]}
      headerActions={
        <>
          <button className="btn btn-primary" type="button" onClick={openNewVoteRound} disabled={!canOpenVote}>
            {openVoteLabel}
          </button>
          <button className="btn btn-danger" type="button" onClick={closeBallot} disabled={!canCloseVote}>
            Close Current Vote
          </button>
        </>
      }
    >
      <PageHero
        title={ballot.title}
        subtitle="Open/close rounds, view results, and seal records."
        rightActions={
          <Link to={`/admin/events/${ballot.event_id}`}>
            <button className="btn btn-secondary secondary" type="button">Back to event</button>
          </Link>
        }
      />
      <section className="ballot-admin-card ballot-admin-hero">
        <h1>{ballot.event_name}</h1>
        <h2>{ballot.title}</h2>
        <div className={`status-badge ${stateClass}`}>{stateLabel}</div>
        <p className="ballot-admin-info">Current Vote: #{ballot.vote_round} ({roundLabel(ballot.vote_round)} vote)</p>
        <p className="ballot-admin-info">Ballot Status: <strong>{ballot.status}</strong></p>
        <p className="ballot-admin-info">PIN Required: {ballot.requires_pin ? 'Yes' : 'No'}</p>
        {orgAccess && (
          <p className={isReadOnly ? 'error' : 'muted'}>
            {isReadOnly
              ? 'Subscription inactive — this event is read-only. You can view/export, but cannot run new votes.'
              : orgAccess.mode === 'TRIAL'
                ? `Trial mode: ${orgAccess.trial_votes_used}/${orgAccess.trial_votes_limit} votes used on your trial event.`
                : 'Paid active: full ballot controls enabled.'}
          </p>
        )}
        {ballot.incumbent_name && <p className="ballot-admin-info">Incumbent: {ballot.incumbent_name}</p>}
        <p className="ballot-admin-description">{ballot.description || 'No description'}</p>
        <div className="participation-panel ballot-admin-live-panel">
          <p><strong>Votes Cast:</strong> {results?.total_votes ?? 0}</p>
          <p><strong>Eligible PINs:</strong> {eligiblePins}</p>
          <p>
            <strong>Participation:</strong>{' '}
            {eligiblePins > 0
              ? `${((((results?.total_votes ?? 0) / eligiblePins) * 100)).toFixed(1)}%`
              : '0.0%'}
          </p>
          <p><strong>Showing Vote:</strong> #{results?.vote_round ?? ballot.vote_round}</p>
          {results?.winner_label && (
            <p className="winner"><strong>Leader:</strong> {results.winner_label} ({(results.top_pct! * 100).toFixed(1)}%)</p>
          )}
        </div>
        {ballot.status === 'CLOSED' && results?.winner_label && (
          <div className="winner-banner">
            <p className="winner-kicker">Election Reached</p>
            <h3>{results.winner_label}</h3>
            <p>{(results.top_pct! * 100).toFixed(1)}% · {thresholdLabel(ballot.majority_rule)}</p>
          </div>
        )}
        {ballot.status === 'CLOSED' && !results?.winner_label && !runoffDismissed && (
          <div className="ballot-admin-runoff-panel">
            <h3>No candidate reached the required majority.</h3>
            <p>A runoff round is required to complete this election.</p>
            <p><strong>Threshold:</strong> {thresholdLabel(ballot.majority_rule)}</p>
            <p className="muted">Common practice: confirm bylaws if only top few candidates proceed to runoff.</p>
            <div className="inline">
              <button className="btn btn-primary" onClick={openNewVoteRound} disabled={!canOperateEvent}>Start runoff round</button>
              <button className="btn btn-secondary secondary" onClick={() => setRunoffDismissed(true)}>Keep closed</button>
            </div>
          </div>
        )}
        {secondsToClose !== null && (
          <p className="ballot-admin-close-countdown">Closing in: {secondsToClose}s</p>
        )}
        {ballot.status === 'CLOSED' && integritySeal && (
          <div className="ballot-admin-runoff-panel">
            <p><strong>Integrity Seal:</strong> {integritySeal.seal_short}</p>
            <p className="muted">This seal verifies the recorded results for this round.</p>
          </div>
        )}
        <p className="ballot-admin-url">
          Vote URL:{' '}
          <a href={`${appBase}/vote/${ballot.slug}`} target="_blank" rel="noreferrer">
            {appBase}/vote/{ballot.slug}
          </a>
        </p>
        <p className="ballot-admin-url">
          Display URL:{' '}
          <a href={`${appBase}/display/${ballot.slug}`} target="_blank" rel="noreferrer">
            {appBase}/display/{ballot.slug}
          </a>
        </p>
        <p className="helper-text">Vote URL is for attendees. Display URL is for projector screens.</p>
        <div className="ballot-admin-qr-actions">
          {voteQrDataUrl && <img className="ballot-admin-qr" src={voteQrDataUrl} alt="Ballot QR code" width={180} height={180} />}
          <div className="inline ballot-admin-actions">
            {ballot.status === 'MANUAL_FALLBACK' ? (
              <p className="muted">Manual fallback mode active. Record manual totals in the Manual Fallback section.</p>
            ) : (
              <>
                <button className="btn btn-primary" onClick={openNewVoteRound} disabled={!canOpenVote}>
                  {ballot.status === 'DRAFT' ? 'Open Vote #1' : `Open Vote #${(ballot.vote_round ?? 1) + 1}`}
                </button>
                <button className="btn btn-danger" onClick={closeBallot} disabled={!canCloseVote}>
                  Close Current Vote (10s delay)
                </button>
              </>
            )}
          </div>
        </div>
        <OperatorRunbook context="ballot" ballotId={ballot.id} round={ballot.vote_round} />
        {error && <p className="error">{error}</p>}
      </section>

      <section className={`accordion ${activeSection === 'edit' ? 'active' : ''}`}>
        <button type="button" className="accordion-header" onClick={() => toggleSection('edit')}>
          <span className="section-title-row">
            Edit Ballot Details
            <InfoTip text="Configure PIN requirement and results visibility. For sensitive votes, hide results until closed." />
          </span>
          <span className="accordion-icon">&#9654;</span>
        </button>
        <div className="accordion-content">
          <form onSubmit={onSaveBallotDetails} className="form-grid" style={{ marginTop: '0.8rem' }}>
            <label className="inline" style={{ gridColumn: '1 / -1' }}>
              <input
                type="checkbox"
                checked={ballot.requires_pin}
                onChange={(e) => togglePinRequirement(e.target.checked)}
                disabled={!canOperateEvent}
              />
              Require PIN for this vote
            </label>
            <fieldset style={{ gridColumn: '1 / -1' }}>
              <legend>Results visibility (required before opening vote)</legend>
              <label className="radio-row">
                <input
                  type="radio"
                  name="resultsVisibility"
                  checked={ballot.results_visibility === 'LIVE'}
                  onChange={() => setResultsVisibility('LIVE')}
                  disabled={!canOperateEvent}
                />
                Show live voting
              </label>
              <label className="radio-row">
                <input
                  type="radio"
                  name="resultsVisibility"
                  checked={ballot.results_visibility === 'CLOSED_ONLY'}
                  onChange={() => setResultsVisibility('CLOSED_ONLY')}
                  disabled={!canOperateEvent}
                />
                Hide results until ballot is closed
              </label>
            </fieldset>
            <label>
              Vote name
              <input className="input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required disabled={!canOperateEvent} />
            </label>
            <label>
              Ballot description
              <textarea className="textarea" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} disabled={!canOperateEvent} />
            </label>
            <label>
              Incumbent name
              <input
                className="input"
                value={editIncumbentName}
                onChange={(e) => setEditIncumbentName(e.target.value)}
                placeholder="Incumbent name (optional)"
                disabled={!canOperateEvent}
              />
            </label>
            <div className="form-actions form-row-full">
              <button className="btn btn-primary" type="submit" disabled={!canOperateEvent}>Save Ballot Details</button>
            </div>
          </form>
        </div>
      </section>

      <section className={`accordion ${activeSection === 'choices' ? 'active' : ''}`}>
        <button type="button" className="accordion-header" onClick={() => toggleSection('choices')}>
          <span className="section-title-row">
            Choices
            <InfoTip text="Add candidates/options. Withdrawn choices are hidden from voters but remain in records." />
          </span>
          <span className="accordion-icon">&#9654;</span>
        </button>
        <div className="accordion-content">
          <form onSubmit={onAddChoice} className="form-actions">
            <input className="input" value={newChoice} onChange={(e) => setNewChoice(e.target.value)} placeholder="Choice label" disabled={!canOperateEvent} />
            <button className="btn btn-primary" type="submit" disabled={!canOperateEvent}>Add</button>
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
                      disabled={!canOperateEvent}
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
                      <button className="btn btn-primary" type="button" onClick={() => saveChoiceLabel(choice.id)} disabled={!canOperateEvent}>Save</button>
                      <button className="btn btn-secondary secondary" type="button" onClick={cancelEditChoice}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-primary" type="button" onClick={() => startEditChoice(choice)} disabled={!canOperateEvent}>Edit</button>
                      <button
                        type="button"
                        className="btn btn-secondary secondary"
                        onClick={() => toggleChoiceWithdraw(choice)}
                        disabled={!canOperateEvent}
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
          <span className="section-title-row">
            Live Results
            <InfoTip text="Monitor participation and results. Close the round to generate an official sealed record." />
          </span>
          <span className="accordion-icon">&#9654;</span>
        </button>
        <div className="accordion-content">
          <div className="participation-panel">
            <p><strong>Votes Cast:</strong> {results?.total_votes ?? 0}</p>
            <p><strong>Eligible PINs:</strong> {eligiblePins}</p>
            <p>
              <strong>Participation:</strong>{' '}
              {eligiblePins > 0
                ? `${((((results?.total_votes ?? 0) / eligiblePins) * 100)).toFixed(1)}%`
                : '0.0%'}
            </p>
          </div>
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

      <section className={`accordion ${activeSection === 'manual' ? 'active' : ''}`}>
        <button type="button" className="accordion-header" onClick={() => toggleSection('manual')}>
          <span className="section-title-row">
            Manual Fallback
            <InfoTip text="Use only for emergency manual count scenarios when digital voting is unavailable." />
          </span>
          <span className="accordion-icon">&#9654;</span>
        </button>
        <div className="accordion-content">
          <p className="muted">
            Use this only if internet/session flow fails. Record a manual count and finalize the round.
          </p>
          <form onSubmit={finalizeManualRound} className="form-grid">
            {choices.filter((choice) => !choice.is_withdrawn).map((choice) => (
              <label key={choice.id} className="manual-row">
                <span>{choice.label}</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={manualCounts[choice.id] ?? '0'}
                  disabled={!canOperateEvent}
                  onChange={(e) =>
                    setManualCounts((prev) => ({
                      ...prev,
                      [choice.id]: e.target.value.replace(/[^\d]/g, '')
                    }))
                  }
                />
              </label>
            ))}
            <label>
              Notes (reason / context)
              <textarea
                className="textarea"
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                placeholder="Example: Internet outage during vote #3. Manual count by tellers."
                disabled={!canOperateEvent}
              />
            </label>
            <div className="form-actions form-row-full">
              <button className="btn btn-primary" type="submit" disabled={ballot.status !== 'MANUAL_FALLBACK' || !canOperateEvent}>
                Record Manual Totals and Close Round
              </button>
            </div>
          </form>
        </div>
      </section>

      {roundHistory.length > 0 && (
        <section className={`accordion ${activeSection === 'history' ? 'active' : ''}`}>
          <button type="button" className="accordion-header" onClick={() => toggleSection('history')}>
            <span className="section-title-row">
              Previous Vote Rounds
              <InfoTip text="If no option meets the threshold, open the next round to run a runoff." />
            </span>
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
          <span className="section-title-row">
            Danger Zone
            <InfoTip text="Archive/delete operations should be used carefully and only by authorized operators." />
          </span>
          <span className="accordion-icon">&#9654;</span>
        </button>
        <div className="accordion-content">
          <p className="muted">
            Switch to Manual Count Mode only if there is an internet issue and voters are unable to vote from their phones.
            This is an emergency fallback, not part of the normal workflow.
          </p>
          <div className="form-actions" style={{ marginBottom: '0.8rem' }}>
            <button
              className="btn btn-secondary secondary"
              onClick={switchToManualFallbackMode}
              disabled={!canOperateEvent || ballot.status === 'MANUAL_FALLBACK'}
            >
              {ballot.status === 'MANUAL_FALLBACK' ? 'Manual Count Mode Active' : 'Switch to Manual Count Mode'}
            </button>
          </div>
          <p className="error">Delete this ballot and all of its votes.</p>
          <button className="btn btn-danger" onClick={deleteBallot} disabled={!isPaidActive}>Delete ballot</button>
        </div>
      </section>
    </AdminLayout>
  )
}
