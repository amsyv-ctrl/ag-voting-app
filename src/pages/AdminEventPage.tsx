import { FormEvent, useMemo, useState, useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { adminGeneratePins, disablePinByCode, exportPinsCsv, verifyReceipt } from '../lib/api'
import { getAccessToken, requireSession } from '../lib/auth'
import { OperatorRunbook } from '../components/OperatorRunbook'
import { AdminLayout } from '../components/AdminLayout'
import { PageHero } from '../components/PageHero'
import { InfoTip } from '../components/InfoTip'
import { computeWinner } from '../lib/winner'

type BallotRow = {
  id: string
  title: string
  incumbent_name: string | null
  slug: string
  status: 'DRAFT' | 'OPEN' | 'CLOSED' | 'MANUAL_FALLBACK'
  results_visibility: 'LIVE' | 'CLOSED_ONLY' | null
  requires_pin: boolean
  created_at: string
  deleted_at?: string | null
  deleted_by?: string | null
}

type BallotIndicator = {
  winnerLabel: string | null
  voteRound: number
  totalVotes: number
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

function createDraftChoice() {
  return `${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`
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
  const [resultsVisibility, setResultsVisibility] = useState<'' | 'LIVE' | 'CLOSED_ONLY'>('')
  const [requiresPin, setRequiresPin] = useState(true)
  const [draftChoices, setDraftChoices] = useState<Array<{ id: string; label: string }>>([
    { id: createDraftChoice(), label: '' },
    { id: createDraftChoice(), label: '' }
  ])
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
  const [ballotIndicators, setBallotIndicators] = useState<Record<string, BallotIndicator>>({})

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
      .select('id,title,incumbent_name,slug,status,results_visibility,requires_pin,created_at')
      .eq('event_id', eventId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (ballotError) {
      setError(ballotError.message)
      return
    }

    setBallots(ballotData ?? [])
    const ballotIds = (ballotData ?? []).map((ballot) => ballot.id)

    const { data: archivedData, error: archivedError } = await supabase
      .from('ballots')
      .select('id,title,incumbent_name,slug,status,results_visibility,requires_pin,created_at,deleted_at,deleted_by')
      .eq('event_id', eventId)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })

    if (archivedError) {
      setError(archivedError.message)
      return
    }

    setArchivedBallots(archivedData ?? [])

    const allBallotIds = [...ballotIds, ...(archivedData ?? []).map((ballot) => ballot.id)]
    if (allBallotIds.length > 0) {
      const [{ data: sealRows, error: sealError }, { data: choiceRows, error: choiceError }] = await Promise.all([
        supabase
          .from('election_result_seals')
          .select('ballot_id,vote_round,majority_rule,total_votes,counts')
          .eq('event_id', eventId)
          .in('ballot_id', allBallotIds)
          .order('vote_round', { ascending: false }),
        supabase
          .from('choices')
          .select('id,ballot_id,label')
          .in('ballot_id', allBallotIds)
      ])

      if (sealError) {
        setError(sealError.message)
        return
      }
      if (choiceError) {
        setError(choiceError.message)
        return
      }

      const labelsByBallot = new Map<string, Array<{ id: string; label: string }>>()
      for (const choice of choiceRows ?? []) {
        const existing = labelsByBallot.get(choice.ballot_id) ?? []
        existing.push({ id: choice.id, label: choice.label })
        labelsByBallot.set(choice.ballot_id, existing)
      }

      const latestByBallot: Record<string, BallotIndicator> = {}
      for (const seal of sealRows ?? []) {
        if (latestByBallot[seal.ballot_id]) continue
        const choiceLabels = labelsByBallot.get(seal.ballot_id) ?? []
        const counts = (seal.counts ?? {}) as Record<string, number>
        const result = computeWinner({
          ballot_id: seal.ballot_id,
          vote_round: seal.vote_round,
          total_votes: Number(seal.total_votes ?? 0),
          rows: choiceLabels.map((choice) => ({
            choice_id: choice.id,
            label: choice.label,
            votes: Number(counts[choice.id] ?? 0),
            pct: Number(seal.total_votes ?? 0) > 0 ? Number(counts[choice.id] ?? 0) / Number(seal.total_votes ?? 0) : 0
          })),
          winner_choice_id: null,
          winner_label: null,
          top_pct: null,
          has_tie: false,
          majority_rule: seal.majority_rule
        })

        latestByBallot[seal.ballot_id] = {
          winnerLabel: result.winner_label,
          voteRound: seal.vote_round,
          totalVotes: Number(seal.total_votes ?? 0)
        }
      }
      setBallotIndicators(latestByBallot)
    } else {
      setBallotIndicators({})
    }

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
    setNotice(null)
    if (!resultsVisibility) {
      setError('Choose how results should display while the ballot is open.')
      jumpToCreateBallot()
      return
    }

    const normalizedChoices = draftChoices
      .map((choice) => choice.label.trim())
      .filter(Boolean)

    if (ballotType === 'PICK_ONE') {
      if (normalizedChoices.length < 2) {
        setError('Add at least two candidate/option choices before creating this ballot.')
        jumpToCreateBallot()
        return
      }

      if (new Set(normalizedChoices.map((choice) => choice.toLowerCase())).size !== normalizedChoices.length) {
        setError('Each candidate/option choice must be unique.')
        jumpToCreateBallot()
        return
      }
    }

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
        results_visibility: resultsVisibility,
        requires_pin: requiresPin,
        status: 'DRAFT'
      })
      .select('id')
      .single()

    if (createError || !data) {
      setError(createError?.message ?? 'Unable to create ballot')
      return
    }

    const choicesToInsert =
      ballotType === 'YES_NO'
        ? [
            { ballot_id: data.id, label: 'Yes', sort_order: 1 },
            { ballot_id: data.id, label: 'No', sort_order: 2 }
          ]
        : normalizedChoices.map((label, index) => ({
            ballot_id: data.id,
            label,
            sort_order: index + 1
          }))

    const { error: choicesError } = await supabase.from('choices').insert(choicesToInsert)
    if (choicesError) {
      await supabase.from('ballots').delete().eq('id', data.id)
      setError(choicesError.message)
      return
    }

    setTitle('')
    setDescription('')
    setIncumbentName('')
    setResultsVisibility('')
    setRequiresPin(true)
    setDraftChoices([
      { id: createDraftChoice(), label: '' },
      { id: createDraftChoice(), label: '' }
    ])
    setNotice('Ballot created and ready for review or immediate opening.')
    await load()
  }

  function updateDraftChoice(choiceId: string, value: string) {
    setDraftChoices((current) => current.map((choice) => (choice.id === choiceId ? { ...choice, label: value } : choice)))
  }

  function addDraftChoice() {
    setDraftChoices((current) => [...current, { id: createDraftChoice(), label: '' }])
  }

  function removeDraftChoice(choiceId: string) {
    setDraftChoices((current) => (current.length <= 2 ? current : current.filter((choice) => choice.id !== choiceId)))
  }

  function moveDraftChoice(choiceId: string, direction: -1 | 1) {
    setDraftChoices((current) => {
      const index = current.findIndex((choice) => choice.id === choiceId)
      const target = index + direction
      if (index < 0 || target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
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
      <section className="admin-page-grid admin-page-grid-two">
        <section className="ui-card admin-surface admin-dark-card">
          <div className="admin-surface-header">
            <div>
              <p className="admin-surface-kicker">Event Overview</p>
              <h3>{eventName || 'Event'}</h3>
              <p className="muted">Operational status, team context, and event-level controls for this meeting.</p>
            </div>
          </div>
          {orgAccess && (
            <div className={`admin-status-banner ${canOperateEvent ? '' : 'admin-status-banner-error'}`}>
              <p className={canOperateEvent ? 'muted' : 'error'} style={{ margin: 0 }}>
                {isReadOnly
                  ? eventArchivedAt
                    ? `This event is archived (${new Date(eventArchivedAt).toLocaleString()}) and is now read-only. You can still view/export results.`
                    : 'Subscription inactive — this event is read-only. You can view/export, but cannot run new votes.'
                  : orgAccess.mode === 'TRIAL'
                    ? `Trial mode: ${orgAccess.trial_votes_used}/${orgAccess.trial_votes_limit} votes used on your trial event.`
                    : 'Paid active: full event controls enabled.'}
              </p>
            </div>
          )}
          <div className="admin-kv-grid space-top-lg">
            <div className="admin-kv">
              <span className="admin-kv-label">Date</span>
              <span className="admin-kv-value">{eventDate || 'Not set'}</span>
            </div>
            <div className="admin-kv">
              <span className="admin-kv-label">Location</span>
              <span className="admin-kv-value">{eventLocation || 'Not set'}</span>
            </div>
            <div className="admin-kv">
              <span className="admin-kv-label">Voting Team</span>
              <span className="admin-kv-value">{votingStaffNames || 'Not set'}</span>
            </div>
            <div className="admin-kv">
              <span className="admin-kv-label">Active PINs</span>
              <span className="admin-kv-value">{activePinCount}</span>
            </div>
          </div>
        </section>

        <section className="ui-card admin-surface">
          <div className="admin-surface-header">
            <div>
              <p className="admin-surface-kicker">Quick Guidance</p>
              <h3>Run this event with a consistent workflow</h3>
            </div>
          </div>
          <div className="admin-guidance-steps">
            <article className="admin-guidance-step">
              <span className="admin-guidance-number">1</span>
              <div>
                <h4>Update the event details first</h4>
                <p className="muted">Keep the event name, location, and voting team accurate so exports and records stay clear.</p>
              </div>
            </article>
            <article className="admin-guidance-step">
              <span className="admin-guidance-number">2</span>
              <div>
                <h4>Generate and distribute PINs only if needed</h4>
                <p className="muted">Use PINs for secure delegate check-in, then verify or disable them here if something changes.</p>
              </div>
            </article>
            <article className="admin-guidance-step">
              <span className="admin-guidance-number">3</span>
              <div>
                <h4>Create ballots and manage rounds from each ballot page</h4>
                <p className="muted">Each ballot carries its own vote links, display links, live results, exports, and runoff workflow.</p>
              </div>
            </article>
          </div>
        </section>
      </section>

      {error && <p className="error">{error}</p>}
      {notice && <p className="winner">{notice}</p>}

      <section className="admin-page-grid admin-page-grid-two">
        <section className="ui-card admin-surface">
          <div className="admin-surface-header">
            <div className="admin-surface-header-copy">
              <p className="admin-surface-kicker">Event Settings</p>
              <h3>Update meeting details</h3>
              <p className="muted">Keep event metadata current so the voting team and records reflect the actual meeting.</p>
            </div>
          </div>

        <div className={`accordion ${editOpen ? 'active' : ''}`}>
          <button type="button" className="accordion-header" onClick={() => setEditOpen((v) => !v)}>
            <span className="section-title-row">
              Edit Event
              <InfoTip text="Update event details for this meeting session." />
            </span>
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
        </section>

        <section className="ui-card admin-surface">
          <div className="admin-surface-header">
            <div className="admin-surface-header-copy">
              <p className="admin-surface-kicker">Delegate Access</p>
              <h3>Manage PINs for secure voting</h3>
              <p className="muted">Generate, export, review, and disable event PINs without leaving the event dashboard.</p>
            </div>
          </div>
        <div id="manage-pins" className={`accordion ${pinsOpen ? 'active' : ''}`}>
          <button type="button" className="accordion-header" onClick={() => setPinsOpen((v) => !v)}>
            <span className="section-title-row">
              Manage PINs
              <InfoTip text="Optional: require PINs for secure votes and one-vote-per-person control." />
            </span>
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
            <div className="form-actions space-top-sm">
              <button className="btn btn-secondary" type="button" onClick={onExportPins} disabled={!canOperateEvent || exportingPins}>
                {exportingPins ? 'Exporting...' : 'Export PINs (CSV)'}
              </button>
            </div>
            <form className="pin-disable-row space-top-sm" onSubmit={onDisablePin}>
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
            <div className="form-actions space-top-sm">
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
                <div className="admin-empty-note section-note">
                  <strong>No PINs yet</strong>
                  <p>Generate PINs here if any ballot in this event requires secure delegate access.</p>
                </div>
              ) : (
                <ul className="pin-list">
                  {activePins.map((pin) => (
                    <li key={pin.id} className={`pin-row ${pin.disabled_at || !pin.is_active ? 'pin-row-disabled' : ''}`}>
                      <span className="pin-code">{String(pin.code).replace(/\D/g, '').slice(0, 4).padStart(4, '0')}</span>
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
            <p className="helper-text helper-text-spaced">Tip: disable a lost PIN, then generate a replacement PIN for that delegate.</p>
          </div>
        </div>
        </section>
      </section>

      <section className="ui-card admin-surface">
        <div className="admin-surface-header">
          <div className="section-title-row">
            <div>
              <p className="admin-surface-kicker">Operator Runbook</p>
              <h3 className="admin-subsection-title">Keep the live session disciplined</h3>
            </div>
            <InfoTip text="Use this checklist to reduce errors during live sessions." />
          </div>
        </div>
        <OperatorRunbook context="event" eventId={eventId} />
      </section>

      <section className="ui-card admin-surface">
        <div className="admin-surface-header">
          <div className="section-title-row">
            <div className="admin-surface-header-copy">
              <p className="admin-surface-kicker">Ballots</p>
              <h3>Manage elections and decisions in this event</h3>
              <p className="muted">Use “Manage” to access attendee vote links and display links. Run the same ballot across multiple rounds for runoff voting.</p>
            </div>
            <InfoTip text="Use Manage to access attendee vote links and display links for projector screens." />
          </div>
        </div>

        <div className="ballot-item">
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
            <div className="ballot-item admin-empty-note">
              <strong>No active ballots yet</strong>
              <p>Create your first ballot for this event to begin managing vote and display links.</p>
            </div>
          ) : (
            <div className="admin-list-stack">
              {ballots.map((ballot) => {
                const indicator = ballotIndicators[ballot.id]
                return (
                  <div className="admin-row-card" key={ballot.id}>
                    <div className="admin-row-header">
                      <div className="admin-row-title">
                        <strong>{ballot.title}</strong>
                        <div className="admin-row-meta">
                          <span className={`status-pill status-${ballot.status.toLowerCase()}`}>{ballot.status}</span>
                          {indicator ? (
                            <span className={`status-pill ${indicator.winnerLabel ? 'status-open' : 'status-closed'}`}>
                              {indicator.winnerLabel ? `Election reached: ${indicator.winnerLabel}` : `No election in round ${indicator.voteRound}`}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="form-actions">
                        <button
                          className="btn btn-danger danger-btn"
                          onClick={() => onArchiveBallot(ballot.id, ballot.title)}
                          disabled={!canOperateEvent}
                        >
                          Archive
                        </button>
                        <Link to={`/admin/ballots/${ballot.id}`} className="btn btn-secondary secondary-btn">
                          Manage
                        </Link>
                      </div>
                    </div>
                    <div className="admin-kv-grid">
                      <div className="admin-kv">
                        <span className="admin-kv-label">Incumbent</span>
                        <span className="admin-kv-value">{ballot.incumbent_name || 'None listed'}</span>
                      </div>
                      <div className="admin-kv">
                        <span className="admin-kv-label">Results display</span>
                        <span className="admin-kv-value">
                          {ballot.results_visibility === 'LIVE'
                            ? 'Show results live while open'
                            : ballot.results_visibility === 'CLOSED_ONLY'
                              ? 'Keep results hidden until closed'
                              : 'Choose before opening'}
                        </span>
                      </div>
                      <div className="admin-kv">
                        <span className="admin-kv-label">PIN required</span>
                        <span className="admin-kv-value">{ballot.requires_pin ? 'Yes' : 'No'}</span>
                      </div>
                      <div className="admin-kv">
                        <span className="admin-kv-label">Total votes in latest sealed round</span>
                        <span className="admin-kv-value">{indicator ? String(indicator.totalVotes) : 'No completed rounds yet'}</span>
                      </div>
                      <div className="admin-kv">
                        <span className="admin-kv-label">Vote URL</span>
                        <span className="admin-kv-value">
                          <a className="url" href={`${appBase}/vote/${ballot.slug}`} target="_blank" rel="noreferrer">
                            {appBase}/vote/{ballot.slug}
                          </a>
                        </span>
                      </div>
                      <div className="admin-kv">
                        <span className="admin-kv-label">Display URL</span>
                        <span className="admin-kv-value">
                          <a className="url" href={`${appBase}/display/${ballot.slug}`} target="_blank" rel="noreferrer">
                            {appBase}/display/{ballot.slug}
                          </a>
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        ) : (
          archivedBallots.length === 0 ? (
            <div className="ballot-item admin-empty-note">
              <strong>No archived ballots</strong>
              <p>Archived ballots will appear here so you can restore them or review their last status.</p>
            </div>
          ) : (
            <div className="admin-list-stack">
              {archivedBallots.map((ballot) => (
                <div className="admin-row-card" key={ballot.id}>
                  <div className="admin-row-header">
                    <div className="admin-row-title">
                      <strong>{ballot.title}</strong>
                      <div className="admin-row-meta">
                        <span className={`status-pill status-${ballot.status.toLowerCase()}`}>{ballot.status}</span>
                        {ballotIndicators[ballot.id] ? (
                          <span className={`status-pill ${ballotIndicators[ballot.id].winnerLabel ? 'status-open' : 'status-closed'}`}>
                            {ballotIndicators[ballot.id].winnerLabel
                              ? `Election reached: ${ballotIndicators[ballot.id].winnerLabel}`
                              : `No election in round ${ballotIndicators[ballot.id].voteRound}`}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <button
                      className="btn btn-secondary secondary-btn"
                      onClick={() => onRestoreBallot(ballot.id, ballot.title)}
                      disabled={!canOperateEvent}
                    >
                      Restore
                    </button>
                  </div>
                  <div className="admin-kv-grid">
                    <div className="admin-kv">
                      <span className="admin-kv-label">Archived</span>
                      <span className="admin-kv-value">{ballot.deleted_at ? new Date(ballot.deleted_at).toLocaleString() : 'N/A'}</span>
                    </div>
                    <div className="admin-kv">
                      <span className="admin-kv-label">Archived by</span>
                      <span className="admin-kv-value">{archivedByLabel(ballot)}</span>
                    </div>
                    <div className="admin-kv">
                      <span className="admin-kv-label">Incumbent</span>
                      <span className="admin-kv-value">{ballot.incumbent_name || 'None listed'}</span>
                    </div>
                    <div className="admin-kv">
                      <span className="admin-kv-label">Results display</span>
                      <span className="admin-kv-value">
                        {ballot.results_visibility === 'LIVE'
                          ? 'Show results live while open'
                          : ballot.results_visibility === 'CLOSED_ONLY'
                            ? 'Keep results hidden until closed'
                            : 'Not set'}
                      </span>
                    </div>
                    <div className="admin-kv">
                      <span className="admin-kv-label">PIN required</span>
                      <span className="admin-kv-value">{ballot.requires_pin ? 'Yes' : 'No'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        <div id="create-ballot" className="ballot-item ballot-create-card">
          <div className="ballot-header">
            <span className="section-title-row">
              Create New Ballot
              <InfoTip text="Ballots are individual decisions or elections. Create as many as needed for this event." />
            </span>
          </div>
          <p className="helper-text create-ballot-intro">Choose how a winner is determined and how results should appear while the ballot is open. Candidate/option ballots can be created fully here so they are ready to open right away.</p>
          <form onSubmit={onCreateBallot} className="form-grid space-top-md">
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
              Select ballot type
              <select className="select" value={ballotType} onChange={(e) => setBallotType(e.target.value as 'YES_NO' | 'PICK_ONE')} disabled={!canOperateEvent}>
                <option value="PICK_ONE">Choose one candidate/option</option>
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
            <fieldset className="form-row form-row-full ballot-visibility-fieldset">
              <legend>When this ballot opens, how should results be displayed?</legend>
              <label className={`ballot-visibility-option ${resultsVisibility === 'LIVE' ? 'is-selected' : ''}`}>
                <input
                  type="radio"
                  name="create-results-visibility"
                  value="LIVE"
                  checked={resultsVisibility === 'LIVE'}
                  onChange={() => setResultsVisibility('LIVE')}
                  disabled={!canOperateEvent}
                />
                <span>
                  <strong>Show results live while voting is open</strong>
                  <small>Use this when the room should watch totals update in real time.</small>
                </span>
              </label>
              <label className={`ballot-visibility-option ${resultsVisibility === 'CLOSED_ONLY' ? 'is-selected' : ''}`}>
                <input
                  type="radio"
                  name="create-results-visibility"
                  value="CLOSED_ONLY"
                  checked={resultsVisibility === 'CLOSED_ONLY'}
                  onChange={() => setResultsVisibility('CLOSED_ONLY')}
                  disabled={!canOperateEvent}
                />
                <span>
                  <strong>Keep results hidden until voting is closed</strong>
                  <small>Use this for more sensitive votes where totals should stay private until the round ends.</small>
                </span>
              </label>
            </fieldset>
            {ballotType === 'PICK_ONE' ? (
              <div className="form-row-full ballot-option-builder">
                <div className="ballot-option-builder-header">
                  <div>
                    <strong>Candidate/option choices</strong>
                    <p className="helper-text">Add the choices attendees should see. At least two choices are required before this ballot can be created.</p>
                  </div>
                  <button type="button" className="btn btn-secondary secondary-btn" onClick={addDraftChoice} disabled={!canOperateEvent}>
                    Add choice
                  </button>
                </div>
                <div className="ballot-option-list">
                  {draftChoices.map((choice, index) => (
                    <div key={choice.id} className="ballot-option-row">
                      <span className="ballot-option-index">{index + 1}</span>
                      <input
                        className="input"
                        value={choice.label}
                        onChange={(e) => updateDraftChoice(choice.id, e.target.value)}
                        placeholder={`Choice ${index + 1}`}
                        disabled={!canOperateEvent}
                      />
                      <div className="form-actions ballot-option-actions">
                        <button
                          type="button"
                          className="btn btn-secondary secondary-btn"
                          onClick={() => moveDraftChoice(choice.id, -1)}
                          disabled={!canOperateEvent || index === 0}
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary secondary-btn"
                          onClick={() => moveDraftChoice(choice.id, 1)}
                          disabled={!canOperateEvent || index === draftChoices.length - 1}
                        >
                          Down
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger danger-btn"
                          onClick={() => removeDraftChoice(choice.id)}
                          disabled={!canOperateEvent || draftChoices.length <= 2}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="helper-text form-row-full">This ballot will be created with the standard Yes and No options automatically.</p>
            )}
            <div className="form-row-full ballot-pin-card">
              <label className="checkbox-label ballot-pin-toggle">
                <input type="checkbox" checked={requiresPin} onChange={(e) => setRequiresPin(e.target.checked)} disabled={!canOperateEvent} />
                <span>
                  <strong>Require PIN for this ballot</strong>
                  <small>Require voters to enter a valid event PIN before submitting this ballot.</small>
                </span>
              </label>
              {requiresPin ? (
                <div className="admin-status-banner ballot-pin-guidance">
                  <p>
                    PIN voting is enabled for this ballot. Before opening voting, make sure event PINs have been generated and distributed to eligible voters.
                  </p>
                  <div className="form-actions">
                    <button
                      type="button"
                      className="btn btn-secondary secondary-btn"
                      onClick={() => {
                        setPinsOpen(true)
                        document.getElementById('manage-pins')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                      }}
                    >
                      Manage event PINs
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="form-actions form-row-full">
              <button className="btn btn-primary" type="submit" disabled={!canOperateEvent}>Create Ballot</button>
            </div>
          </form>
        </div>
      </section>

      <section className="admin-page-grid admin-page-grid-two">
        <div className="ui-card admin-surface">
          <div className="admin-surface-header">
            <div className="section-title-row">
              <div>
                <p className="admin-surface-kicker">Receipt Lookup</p>
                <h3 className="admin-subsection-title">Verify vote receipts safely</h3>
              </div>
              <InfoTip text="Check that a receipt code exists without revealing voter choice." />
            </div>
          </div>
          <div className="ballot-header">
            <span>Verify Receipt</span>
          </div>
          <form onSubmit={onVerifyReceipt} className="form-actions section-note">
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
              <p className="muted space-top-sm">
                Receipt found. Event: {receiptLookupResult.event_id} | Ballot: {receiptLookupResult.ballot_id} | Round: #{receiptLookupResult.round} | Recorded: {receiptLookupResult.created_at ? new Date(receiptLookupResult.created_at).toLocaleString() : 'N/A'}
              </p>
            ) : (
              <p className="muted space-top-sm">No matching receipt found in your organization scope.</p>
            )
          )}
        </div>
        <div className="ui-card admin-surface">
          <div className="admin-surface-header">
            <div className="section-title-row">
              <div>
                <p className="admin-surface-kicker">Exports</p>
                <h3 className="admin-subsection-title">Download official records</h3>
              </div>
              <InfoTip text="Export sealed official records for governance files and CSV convenience summaries." />
            </div>
          </div>

        <div className="export-section" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
          <button className="btn btn-primary" onClick={onExportOfficialRecord} disabled={exportingOfficial}>
            {exportingOfficial ? 'Exporting Official Record...' : 'Export Official Record (JSON)'}
          </button>
          <div style={{ height: '0.6rem' }} />
          <button className="btn btn-secondary secondary-btn" onClick={onExportResults} disabled={exporting}>
            {exporting ? 'Exporting...' : 'Export All Voting Results (CSV)'}
          </button>
          <p className="subtitle space-top-sm">
            JSON is the primary verifiable official record. CSV remains available as a convenience export.
          </p>
        </div>
        </div>
      </section>
    </AdminLayout>
  )
}
