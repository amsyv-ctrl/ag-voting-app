import { FormEvent, useMemo, useState, useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { adminGeneratePins, disablePinByCode, exportPinsCsv, verifyReceipt } from '../lib/api'
import { getAccessToken, requireSession } from '../lib/auth'
import { OperatorRunbook } from '../components/OperatorRunbook'
import { AdminLayout } from '../components/AdminLayout'
import { PageHero } from '../components/PageHero'

type BallotRow = {
  id: string
  title: string
  incumbent_name: string | null
  slug: string
  status: 'DRAFT' | 'OPEN' | 'CLOSED' | 'MANUAL_FALLBACK'
  requires_pin: boolean
  created_at: string
  deleted_at?: string | null
  deleted_by?: string | null
}

type OrgAccessRow = {
  id: string
  mode: 'DEMO' | 'TRIAL' | 'PAID'
  is_active: boolean
  trial_event_id: string | null
  trial_votes_used: number
  trial_votes_limit: number
}

type PinRow = {
  id: string
  code: string
  is_active: boolean
  created_at: string
  disabled_at: string | null
  disabled_by: string | null
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

type SealRow = {
  ballot_id: string
  vote_round: number
  seal_short: string
  seal_hash: string
  total_votes: number
  counts: Record<string, number>
  closed_at: string
  threshold_required: 'SIMPLE' | 'TWO_THIRDS'
}

type ReceiptLookupResult = {
  found: boolean
  ballot_id?: string
  event_id?: string
  round?: number
  created_at?: string
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
  const [archivedBallots, setArchivedBallots] = useState<BallotRow[]>([])
  const [ballotsView, setBallotsView] = useState<'ACTIVE' | 'ARCHIVED'>('ACTIVE')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [activePins, setActivePins] = useState<PinRow[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [incumbentName, setIncumbentName] = useState('')
  const [majorityRule, setMajorityRule] = useState<'SIMPLE' | 'TWO_THIRDS'>('SIMPLE')
  const [ballotType, setBallotType] = useState<'YES_NO' | 'PICK_ONE'>('PICK_ONE')
  const [requiresPin, setRequiresPin] = useState(true)
  const [pinCount, setPinCount] = useState(100)
  const [pinsOutput, setPinsOutput] = useState<string[]>([])
  const [pinToDisable, setPinToDisable] = useState('')
  const [disablingPin, setDisablingPin] = useState(false)
  const [exportingPins, setExportingPins] = useState(false)
  const [receiptCodeInput, setReceiptCodeInput] = useState('')
  const [verifyingReceipt, setVerifyingReceipt] = useState(false)
  const [receiptLookupResult, setReceiptLookupResult] = useState<ReceiptLookupResult | null>(null)
  const [receiptLookupError, setReceiptLookupError] = useState<string | null>(null)
  const [exportingOfficial, setExportingOfficial] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [orgAccess, setOrgAccess] = useState<OrgAccessRow | null>(null)
  const [eventArchivedAt, setEventArchivedAt] = useState<string | null>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [pinsOpen, setPinsOpen] = useState(false)

  const appBase = useMemo(() => window.location.origin, [])
  const activePinCount = useMemo(
    () => activePins.filter((pin) => pin.is_active && !pin.disabled_at).length,
    [activePins]
  )

  async function load() {
    const session = await requireSession()
    if (!session) {
      navigate('/admin')
      return
    }
    setCurrentUserId(session.user.id)

    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('name,date,location,voting_staff_names,org_id,is_trial_event,archived_at')
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
    setEventArchivedAt(eventData.archived_at ?? null)

    const { data: orgData, error: orgError } = await supabase
      .from('organizations')
      .select('id,mode,is_active,trial_event_id,trial_votes_used,trial_votes_limit')
      .eq('id', eventData.org_id)
      .single()

    if (orgError) {
      setError(orgError.message)
      return
    }
    setOrgAccess(orgData as OrgAccessRow)

    const { data: ballotData, error: ballotError } = await supabase
      .from('ballots')
      .select('id,title,incumbent_name,slug,status,requires_pin,created_at')
      .eq('event_id', eventId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (ballotError) {
      setError(ballotError.message)
      return
    }

    setBallots(ballotData ?? [])

    const { data: archivedData, error: archivedError } = await supabase
      .from('ballots')
      .select('id,title,incumbent_name,slug,status,requires_pin,created_at,deleted_at,deleted_by')
      .eq('event_id', eventId)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })

    if (archivedError) {
      setError(archivedError.message)
      return
    }

    setArchivedBallots(archivedData ?? [])

    const { data: pinData, error: pinError } = await supabase
      .from('pins')
      .select('id,code,is_active,created_at,disabled_at,disabled_by')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })

    if (pinError) {
      setError(pinError.message)
      return
    }

    setActivePins(pinData ?? [])
  }

  function jumpToCreateBallot() {
    const section = document.getElementById('create-ballot')
    if (!section) return
    section.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  useEffect(() => {
    load()
  }, [eventId])

  async function onCreateBallot(e: FormEvent) {
    e.preventDefault()
    if (!canOperateEvent) {
      setError('Subscription inactive. This event is read-only.')
      return
    }
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
    if (!canOperateEvent) {
      setError('Subscription inactive. This event is read-only.')
      return
    }
    setError(null)
    const token = await getAccessToken()
    if (!token) {
      navigate('/admin')
      return
    }

    try {
      const result = await adminGeneratePins(token, eventId, pinCount)
      setPinsOutput(result.generated)
      setNotice(`Generated ${result.generated.length} PINs.`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate PINs')
    }
  }

  async function onDeleteAllPins() {
    if (!canOperateEvent) {
      setError('Subscription inactive. This event is read-only.')
      return
    }
    const typed = window.prompt('Type DELETE to permanently remove all PINs for this event.')
    if (typed !== 'DELETE') {
      return
    }

    setError(null)
    setNotice(null)
    const { error: deleteError } = await supabase.from('pins').delete().eq('event_id', eventId)
    if (deleteError) {
      setError(deleteError.message)
      return
    }

    setPinsOutput([])
    setNotice('All PINs deleted for this event.')
    await load()
  }

  async function onExportPins() {
    if (!canOperateEvent) {
      setError('Subscription inactive. This event is read-only.')
      return
    }
    setError(null)
    setNotice(null)
    setExportingPins(true)
    try {
      const token = await getAccessToken()
      if (!token) {
        navigate('/admin')
        return
      }
      const { blob, filename } = await exportPinsCsv(token, eventId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export PIN CSV')
    } finally {
      setExportingPins(false)
    }
  }

  async function onDisablePin(e: FormEvent) {
    e.preventDefault()
    if (!canOperateEvent) {
      setError('Subscription inactive. This event is read-only.')
      return
    }

    const normalized = pinToDisable.replace(/\D/g, '').slice(0, 4)
    if (!/^\d{4}$/.test(normalized)) {
      setError('PIN must be a 4-digit code.')
      return
    }

    setError(null)
    setNotice(null)
    setDisablingPin(true)
    try {
      const token = await getAccessToken()
      if (!token) {
        navigate('/admin')
        return
      }
      const result = await disablePinByCode(token, eventId, normalized)
      setPinToDisable('')
      setNotice(result.alreadyDisabled ? 'PIN was already disabled.' : 'PIN disabled.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disable PIN')
    } finally {
      setDisablingPin(false)
    }
  }

  async function onUpdateEvent(e: FormEvent) {
    e.preventDefault()
    if (!canOperateEvent) {
      setError('Subscription inactive. This event is read-only.')
      return
    }
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

  async function onRestoreBallot(ballotId: string, ballotTitle: string) {
    if (!canOperateEvent) {
      setError('Subscription inactive. This event is read-only.')
      return
    }
    const confirmed = window.confirm(`Restore archived ballot "${ballotTitle}"?`)
    if (!confirmed) return

    setError(null)
    const { error: restoreError } = await supabase
      .from('ballots')
      .update({ deleted_at: null, deleted_by: null })
      .eq('id', ballotId)

    if (restoreError) {
      setError(restoreError.message)
      return
    }

    await load()
  }

  async function onArchiveBallot(ballotId: string, ballotTitle: string) {
    if (!canOperateEvent) {
      setError('Subscription inactive. This event is read-only.')
      return
    }
    const confirmed = window.confirm(
      `Archive ballot "${ballotTitle}"?\n\nArchiving a ballot will close all open sessions and hide it from active lists.`
    )
    if (!confirmed) return

    setError(null)
    const nowIso = new Date().toISOString()
    const { error: archiveError } = await supabase
      .from('ballots')
      .update({
        status: 'CLOSED',
        closes_at: nowIso,
        deleted_at: nowIso,
        deleted_by: currentUserId
      })
      .eq('id', ballotId)

    if (archiveError) {
      setError(archiveError.message)
      return
    }

    await load()
  }

  function archivedByLabel(ballot: BallotRow) {
    if (!ballot.deleted_by) return 'Unknown'
    if (ballot.deleted_by === currentUserId) return 'You'
    const id = ballot.deleted_by
    return `${id.slice(0, 8)}...${id.slice(-4)}`
  }

  async function onExportResults() {
    setError(null)
    setExporting(true)
    try {
      const { data, error: exportError } = await supabase.rpc('export_event_results_admin', {
        p_event_id: eventId
      })
      if (exportError) throw new Error(exportError.message)
      if (!data) throw new Error('Export failed: empty export payload')

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

      const { data: sealsData, error: sealsError } = await supabase
        .from('election_result_seals')
        .select('ballot_id,vote_round,seal_short,seal_hash,total_votes,counts,closed_at,threshold_required')
        .eq('event_id', eventId)

      if (sealsError) throw new Error(sealsError.message)
      const sealByRound = new Map<string, SealRow>()
      for (const seal of (sealsData ?? []) as SealRow[]) {
        sealByRound.set(`${seal.ballot_id}:${seal.vote_round}`, seal)
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
        'seal_short',
        'seal_hash',
        'seal_closed_at',
        'seal_threshold_required',
        'seal_total_votes',
        'seal_counts_json',
        'choice_label',
        'choice_votes',
        'choice_pct',
        'choice_withdrawn'
      ].map(csvCell).join(','))

      for (const summary of payload.summaries ?? []) {
        const seal = sealByRound.get(`${summary.ballot_id}:${summary.vote_round}`)
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
            seal?.seal_short ?? '',
            seal?.seal_hash ?? '',
            seal?.closed_at ?? '',
            seal?.threshold_required ?? '',
            seal?.total_votes ?? '',
            seal ? JSON.stringify(seal.counts ?? {}) : '',
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
            seal?.seal_short ?? '',
            seal?.seal_hash ?? '',
            seal?.closed_at ?? '',
            seal?.threshold_required ?? '',
            seal?.total_votes ?? '',
            seal ? JSON.stringify(seal.counts ?? {}) : '',
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
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err && typeof (err as { message: unknown }).message === 'string'
            ? (err as { message: string }).message
            : 'Export failed'
      if (/function .*export_event_results_admin.* does not exist/i.test(message)) {
        setError('Export failed: database migration for export RPC is missing. Apply the latest Supabase migrations and retry.')
      } else {
        setError(message)
      }
    } finally {
      setExporting(false)
    }
  }

  async function onExportOfficialRecord() {
    setError(null)
    setExportingOfficial(true)
    try {
      const token = await getAccessToken()
      if (!token) {
        navigate('/admin')
        return
      }

      const res = await fetch('/api/exportOfficialRecord', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ event_id: eventId })
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const message =
          typeof body?.error === 'string'
            ? body.error
            : typeof body?.message === 'string'
              ? body.message
              : 'Official record export failed'
        throw new Error(message)
      }

      const blob = await res.blob()
      const disposition = res.headers.get('content-disposition') || ''
      const match = disposition.match(/filename="?([^"]+)"?/)
      const filename = match?.[1] || `event_record_${eventId}.json`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Official record export failed')
    } finally {
      setExportingOfficial(false)
    }
  }

  async function onVerifyReceipt(e: FormEvent) {
    e.preventDefault()
    setReceiptLookupError(null)
    setReceiptLookupResult(null)
    const token = await getAccessToken()
    if (!token) {
      navigate('/admin')
      return
    }

    const input = receiptCodeInput.trim()
    if (!input) {
      setReceiptLookupError('Enter a receipt code.')
      return
    }

    setVerifyingReceipt(true)
    try {
      const result = await verifyReceipt(token, input)
      setReceiptLookupResult(result)
    } catch (err) {
      setReceiptLookupError(err instanceof Error ? err.message : 'Receipt lookup failed')
    } finally {
      setVerifyingReceipt(false)
    }
  }

  const isPaidActive = !!(orgAccess?.mode === 'PAID' && orgAccess?.is_active)
  const isTrialActiveForThisEvent = !!(
    orgAccess?.mode === 'TRIAL' &&
    orgAccess?.trial_event_id === eventId &&
    (orgAccess?.trial_votes_used ?? 0) < (orgAccess?.trial_votes_limit ?? 0)
  )
  const hasEntitledEventAccess = isPaidActive || isTrialActiveForThisEvent
  const canOperateEvent = hasEntitledEventAccess && !eventArchivedAt
  const isReadOnly = !canOperateEvent

  return (
    <AdminLayout
      breadcrumb={['Events', eventName || 'Event']}
      headerActions={
        <>
          <button className="btn btn-primary" type="button" onClick={jumpToCreateBallot}>+ New Ballot</button>
          <button className="btn btn-secondary" type="button" onClick={onExportOfficialRecord} disabled={exportingOfficial}>
            {exportingOfficial ? 'Exporting...' : 'Export'}
          </button>
        </>
      }
    >
      <PageHero
        title={eventName || 'Event'}
        subtitle={`Manage ballots, PINs, and exports.${votingStaffNames ? ` Voting Team: ${votingStaffNames}` : ''}`}
        rightActions={
          <Link to="/admin">
            <button className="btn btn-secondary secondary" type="button">Back to events</button>
          </Link>
        }
      />
      <section className="form-section">
        {orgAccess && (
          <p className={canOperateEvent ? 'muted' : 'error'}>
            {isReadOnly
              ? eventArchivedAt
                ? `This event is archived (${new Date(eventArchivedAt).toLocaleString()}) and is now read-only. You can still view/export results.`
                : 'Subscription inactive — this event is read-only. You can view/export, but cannot run new votes.'
              : orgAccess.mode === 'TRIAL'
                ? `Trial mode: ${orgAccess.trial_votes_used}/${orgAccess.trial_votes_limit} votes used on your trial event.`
                : 'Paid active: full event controls enabled.'}
          </p>
        )}
        {error && <p className="error">{error}</p>}
        {notice && <p className="winner">{notice}</p>}

        <div className={`accordion ${editOpen ? 'active' : ''}`}>
          <button type="button" className="accordion-header" onClick={() => setEditOpen((v) => !v)}>
            Edit Event
            <span className="accordion-icon">&#9654;</span>
          </button>
          <div className="accordion-content">
            <form onSubmit={onUpdateEvent} className="form-grid">
              <label className="form-row">
                Event name
                <input className="input" value={eventName} onChange={(e) => setEventName(e.target.value)} required disabled={!canOperateEvent} />
              </label>
              <label className="form-row">
                Event date
                <input className="input" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} disabled={!canOperateEvent} />
              </label>
              <label className="form-row">
                Event location
                <input className="input" value={eventLocation} onChange={(e) => setEventLocation(e.target.value)} placeholder="Location" disabled={!canOperateEvent} />
              </label>
              <label className="form-row">
                Names running voting
                <input
                  className="input"
                  value={votingStaffNames}
                  onChange={(e) => setVotingStaffNames(e.target.value)}
                  placeholder="Example: Yisrael Vincent"
                  disabled={!canOperateEvent}
                />
              </label>
              <div className="form-actions form-row-full">
                <button className="btn btn-primary" type="submit" disabled={!canOperateEvent}>Save Event Details</button>
              </div>
            </form>
          </div>
        </div>

        <div className={`accordion ${pinsOpen ? 'active' : ''}`}>
          <button type="button" className="accordion-header" onClick={() => setPinsOpen((v) => !v)}>
            Manage PINs
            <span className="accordion-icon">&#9654;</span>
          </button>
          <div className="accordion-content">
            <p>
              If ballot PINs are turned on, voters must enter their unique 4-digit PIN to vote.
              Each PIN can vote one time per ballot, but works across all ballots in this event.
              Distribute one PIN per registered voter at check-in. Active PINs for this event:{' '}
              <strong>{activePinCount}</strong>.
            </p>
            <form className="form-actions" onSubmit={onGeneratePins}>
              <input
                className="input pin-input"
                type="number"
                min={1}
                max={500}
                value={pinCount}
                onChange={(e) => setPinCount(Math.max(1, Math.min(Number(e.target.value), 500)))}
                disabled={!canOperateEvent}
              />
              <button className="btn btn-primary" type="submit" disabled={!canOperateEvent}>Generate</button>
            </form>
            <div className="form-actions" style={{ marginTop: '10px' }}>
              <button className="btn btn-secondary" type="button" onClick={onExportPins} disabled={!canOperateEvent || exportingPins}>
                {exportingPins ? 'Exporting...' : 'Export PINs (CSV)'}
              </button>
            </div>
            <form className="pin-disable-row" style={{ marginTop: '10px' }} onSubmit={onDisablePin}>
              <label className="form-row" style={{ margin: 0 }}>
                Disable PIN
                <input
                  className="input"
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  value={pinToDisable}
                  onChange={(evt) => setPinToDisable(evt.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="0000"
                  disabled={!canOperateEvent || disablingPin}
                />
              </label>
              <button className="btn btn-danger" type="submit" disabled={!canOperateEvent || disablingPin}>
                {disablingPin ? 'Disabling...' : 'Disable'}
              </button>
            </form>
            <p className="helper-text">Use if a PIN is lost and needs to be reissued. You can generate additional PINs here at any time.</p>
            <div className="form-actions" style={{ marginTop: '10px' }}>
              <button className="btn btn-danger danger-btn" onClick={onDeleteAllPins} disabled={!canOperateEvent}>Delete All PINs</button>
            </div>
            {pinsOutput.length > 0 && (
              <details>
                <summary>Show newly generated PINs ({pinsOutput.length})</summary>
                <pre className="code-block">{pinsOutput.join(', ')}</pre>
              </details>
            )}
            <details>
              <summary>View event PINs ({activePins.length})</summary>
              {activePins.length === 0 ? (
                <p>No PINs yet.</p>
              ) : (
                <ul className="pin-list">
                  {activePins.map((pin) => (
                    <li key={pin.id} className={`pin-row ${pin.disabled_at || !pin.is_active ? 'pin-row-disabled' : ''}`}>
                      <span className="pin-code">{pin.code}</span>
                      <span className="pin-status">{pin.disabled_at || !pin.is_active ? 'Disabled' : 'Active'}</span>
                      <span className="muted">
                        Created {new Date(pin.created_at).toLocaleString()}
                        {pin.disabled_at ? ` • Disabled ${new Date(pin.disabled_at).toLocaleString()}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </details>
            <p className="helper-text" style={{ marginTop: '0.5rem' }}>Tip: disable a lost PIN, then generate a replacement PIN for that delegate.</p>
          </div>
        </div>

        <OperatorRunbook context="event" eventId={eventId} />

        <h2>Ballots</h2>
        <p className="subtitle">Includes round summaries, counts per choice, and the timestamp each election threshold was first reached.</p>

        <div className="ballot-item" style={{ marginBottom: '1rem' }}>
          <div className="ballot-header">Ballot View</div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button
              type="button"
              className={ballotsView === 'ACTIVE' ? 'btn btn-primary' : 'btn btn-secondary secondary-btn'}
              onClick={() => setBallotsView('ACTIVE')}
            >
              Active ({ballots.length})
            </button>
            <button
              type="button"
              className={ballotsView === 'ARCHIVED' ? 'btn btn-primary' : 'btn btn-secondary secondary-btn'}
              onClick={() => setBallotsView('ARCHIVED')}
            >
              Archived ({archivedBallots.length})
            </button>
          </div>
        </div>

        {ballotsView === 'ACTIVE' ? (
          ballots.length === 0 ? (
            <div className="ballot-item">
              <p className="muted">No active ballots yet.</p>
            </div>
          ) : (
            ballots.map((ballot) => (
              <div className="ballot-item" key={ballot.id}>
                <div className="ballot-header">
                  <span>{ballot.title}</span>
                    <div className="form-actions">
                      <button
                        className="btn btn-danger danger-btn"
                      onClick={() => onArchiveBallot(ballot.id, ballot.title)}
                      disabled={!canOperateEvent}
                    >
                      Archive
                    </button>
                    <Link to={`/admin/ballots/${ballot.id}`}>
                      <button className="btn btn-secondary secondary-btn">Manage</button>
                    </Link>
                  </div>
                </div>
                <div className="ballot-details">
                  Status: {ballot.status}<br />
                  Incumbent: {ballot.incumbent_name || 'N/A'}<br />
                  PIN required: {ballot.requires_pin ? 'Yes' : 'No'}<br />
                  Vote URL: <span className="url">{appBase}/vote/{ballot.slug}</span><br />
                  Display URL: <span className="url">{appBase}/display/{ballot.slug}</span>
                </div>
              </div>
            ))
          )
        ) : (
          archivedBallots.length === 0 ? (
            <div className="ballot-item">
              <p className="muted">No archived ballots.</p>
            </div>
          ) : (
            archivedBallots.map((ballot) => (
              <div className="ballot-item" key={ballot.id}>
                <div className="ballot-header">
                  <span>{ballot.title}</span>
                  <button
                    className="btn btn-secondary secondary-btn"
                    onClick={() => onRestoreBallot(ballot.id, ballot.title)}
                    disabled={!canOperateEvent}
                  >
                    Restore
                  </button>
                </div>
                <div className="ballot-details">
                  Archived: {ballot.deleted_at ? new Date(ballot.deleted_at).toLocaleString() : 'N/A'}<br />
                  Archived by: {archivedByLabel(ballot)}<br />
                  Last status: {ballot.status}<br />
                  Incumbent: {ballot.incumbent_name || 'N/A'}<br />
                  PIN required: {ballot.requires_pin ? 'Yes' : 'No'}
                </div>
              </div>
            ))
          )
        )}

        <div id="create-ballot" className="ballot-item ballot-create-card">
          <div className="ballot-header">Create New Ballot</div>
          <form onSubmit={onCreateBallot} className="form-grid" style={{ marginTop: '15px' }}>
            <label className="form-row">
              Ballot title
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ballot title" required disabled={!canOperateEvent} />
            </label>
            <label className="form-row">
              Description
              <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" disabled={!canOperateEvent} />
            </label>
            <label className="form-row">
              Incumbent name
              <input
                className="input"
                value={incumbentName}
                onChange={(e) => setIncumbentName(e.target.value)}
                placeholder="Incumbent name (optional)"
                disabled={!canOperateEvent}
              />
            </label>
            <label className="form-row">
              Ballot type
              <select className="select" value={ballotType} onChange={(e) => setBallotType(e.target.value as 'YES_NO' | 'PICK_ONE')} disabled={!canOperateEvent}>
                <option value="PICK_ONE">Pick one candidate</option>
                <option value="YES_NO">Yes / No</option>
              </select>
            </label>
            <label className="form-row">
              Majority rule
              <select className="select" value={majorityRule} onChange={(e) => setMajorityRule(e.target.value as 'SIMPLE' | 'TWO_THIRDS')} disabled={!canOperateEvent}>
                <option value="SIMPLE">Simple majority (&gt;50%)</option>
                <option value="TWO_THIRDS">Two thirds (≥66.67%)</option>
              </select>
            </label>
            <label className="checkbox-label form-row-full">
              <input type="checkbox" checked={requiresPin} onChange={(e) => setRequiresPin(e.target.checked)} disabled={!canOperateEvent} />
              Require PIN for this ballot
            </label>
            <div className="form-actions form-row-full">
              <button className="btn btn-primary" type="submit" disabled={!canOperateEvent}>Create Ballot</button>
            </div>
          </form>
        </div>

        <div className="ballot-item">
          <div className="ballot-header">Verify Receipt</div>
          <form onSubmit={onVerifyReceipt} className="form-actions" style={{ marginTop: '0.75rem' }}>
            <label className="form-row" style={{ flex: '1 1 320px', margin: 0 }}>
              Verify receipt
              <input
                className="input"
                value={receiptCodeInput}
                onChange={(e) => setReceiptCodeInput(e.target.value.toUpperCase())}
                placeholder="Receipt code (e.g. 7F3A-92C1)"
              />
            </label>
            <button type="submit" className="btn btn-secondary secondary-btn" disabled={verifyingReceipt}>
              {verifyingReceipt ? 'Checking...' : 'Check'}
            </button>
          </form>
          {receiptLookupError && <p className="error">{receiptLookupError}</p>}
          {receiptLookupResult && (
            receiptLookupResult.found ? (
              <p className="muted" style={{ marginTop: '0.6rem' }}>
                Receipt found. Event: {receiptLookupResult.event_id} | Ballot: {receiptLookupResult.ballot_id} | Round: #{receiptLookupResult.round} | Recorded: {receiptLookupResult.created_at ? new Date(receiptLookupResult.created_at).toLocaleString() : 'N/A'}
              </p>
            ) : (
              <p className="muted" style={{ marginTop: '0.6rem' }}>No matching receipt found in your organization scope.</p>
            )
          )}
        </div>

        <div className="export-section">
          <button className="btn btn-primary" onClick={onExportOfficialRecord} disabled={exportingOfficial}>
            {exportingOfficial ? 'Exporting Official Record...' : 'Export Official Record (JSON)'}
          </button>
          <div style={{ height: '0.6rem' }} />
          <button className="btn btn-secondary secondary-btn" onClick={onExportResults} disabled={exporting}>
            {exporting ? 'Exporting...' : 'Export All Voting Results (CSV)'}
          </button>
          <p className="subtitle" style={{ marginTop: '10px' }}>
            JSON is the primary verifiable official record. CSV remains available as a convenience export.
          </p>
        </div>
      </section>
    </AdminLayout>
  )
}
