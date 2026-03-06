import type { Handler } from '@netlify/functions'
import { supabaseAdmin } from './_supabase'

const SUPER_ADMIN_EMAIL = 'yvincent90@gmail.com'

type OrganizationRow = {
  id: string
  name: string
  created_at: string
  mode: 'DEMO' | 'TRIAL' | 'PAID'
  is_active: boolean
  organization_type: string | null
  estimated_voting_size: string | null
  subscription_status: string | null
  current_period_end: string | null
  stripe_subscription_id: string | null
  trial_event_id: string | null
}

type EventRow = {
  id: string
  org_id: string
  name: string
  date: string | null
  location: string | null
}

type BallotRow = {
  id: string
  event_id: string
}

type VoteRow = {
  ballot_id: string
}

function classifySubscription(org: OrganizationRow) {
  if (org.mode === 'PAID' && org.is_active) return 'PAID_ACTIVE'
  if (org.mode === 'TRIAL') return 'TRIAL'
  return 'INACTIVE_CANCELED'
}

function toDateValue(value: string | null) {
  if (!value) return Number.NaN
  const date = new Date(value)
  return date.getTime()
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const token = event.headers.authorization?.replace('Bearer ', '').trim()
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
  const user = userData.user
  if (userError || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  if ((user.email ?? '').toLowerCase() !== SUPER_ADMIN_EMAIL) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) }
  }

  const [
    orgResult,
    eventResult,
    ballotResult,
    voteResult
  ] = await Promise.all([
    supabaseAdmin
      .from('organizations')
      .select('id,name,created_at,mode,is_active,organization_type,estimated_voting_size,subscription_status,current_period_end,stripe_subscription_id,trial_event_id')
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('events')
      .select('id,org_id,name,date,location')
      .order('date', { ascending: true }),
    supabaseAdmin
      .from('ballots')
      .select('id,event_id')
      .is('deleted_at', null),
    supabaseAdmin
      .from('votes')
      .select('ballot_id')
  ])

  if (orgResult.error) {
    return { statusCode: 500, body: JSON.stringify({ error: orgResult.error.message }) }
  }
  if (eventResult.error) {
    return { statusCode: 500, body: JSON.stringify({ error: eventResult.error.message }) }
  }
  if (ballotResult.error) {
    return { statusCode: 500, body: JSON.stringify({ error: ballotResult.error.message }) }
  }
  if (voteResult.error) {
    return { statusCode: 500, body: JSON.stringify({ error: voteResult.error.message }) }
  }

  const organizations = (orgResult.data ?? []) as OrganizationRow[]
  const events = (eventResult.data ?? []) as EventRow[]
  const ballots = (ballotResult.data ?? []) as BallotRow[]
  const votes = (voteResult.data ?? []) as VoteRow[]

  const orgById = new Map(organizations.map((org) => [org.id, org]))
  const eventById = new Map(events.map((evt) => [evt.id, evt]))
  const ballotById = new Map(ballots.map((ballot) => [ballot.id, ballot]))

  const orgVoteTotals = new Map<string, number>()
  for (const vote of votes) {
    const ballot = ballotById.get(vote.ballot_id)
    if (!ballot) continue
    const linkedEvent = eventById.get(ballot.event_id)
    if (!linkedEvent) continue
    orgVoteTotals.set(linkedEvent.org_id, (orgVoteTotals.get(linkedEvent.org_id) ?? 0) + 1)
  }

  const now = Date.now()
  const upcomingLimit = now + (14 * 24 * 60 * 60 * 1000)

  const statusCounts = {
    TRIAL: 0,
    PAID_ACTIVE: 0,
    INACTIVE_CANCELED: 0
  }
  const organizationTypeCounts: Record<string, number> = {}
  const votingSizeCounts: Record<string, number> = {}

  for (const org of organizations) {
    statusCounts[classifySubscription(org)] += 1
    const typeKey = org.organization_type?.trim() || 'Unspecified'
    organizationTypeCounts[typeKey] = (organizationTypeCounts[typeKey] ?? 0) + 1
    const sizeKey = org.estimated_voting_size?.trim() || 'Unspecified'
    votingSizeCounts[sizeKey] = (votingSizeCounts[sizeKey] ?? 0) + 1
  }

  const ballotsByOrg = new Set<string>()
  for (const ballot of ballots) {
    const linkedEvent = eventById.get(ballot.event_id)
    if (!linkedEvent) continue
    ballotsByOrg.add(linkedEvent.org_id)
  }

  const eventsByOrg = new Set(events.map((evt) => evt.org_id))

  const trialOrgs = organizations.filter((org) => org.mode === 'TRIAL')
  const trialWithEvent = trialOrgs.filter((org) => eventsByOrg.has(org.id)).length
  const trialWithBallot = trialOrgs.filter((org) => ballotsByOrg.has(org.id)).length
  const convertedToPaid = organizations.filter((org) => org.mode === 'PAID').length

  const upcomingEvents = events
    .filter((evt) => {
      const dateValue = toDateValue(evt.date)
      return !Number.isNaN(dateValue) && dateValue >= now && dateValue <= upcomingLimit
    })
    .sort((a, b) => toDateValue(a.date) - toDateValue(b.date))
    .slice(0, 10)
    .map((evt) => ({
      org_name: orgById.get(evt.org_id)?.name ?? 'Organization',
      event_name: evt.name,
      date: evt.date,
      location: evt.location
    }))

  const recentSignups = organizations
    .slice()
    .sort((a, b) => toDateValue(b.created_at) - toDateValue(a.created_at))
    .slice(0, 10)
    .map((org) => ({
      org_name: org.name,
      created_at: org.created_at,
      mode: org.mode,
      organization_type: org.organization_type
    }))

  const recentSubscriptions = organizations
    .filter((org) => org.subscription_status || org.stripe_subscription_id)
    .sort((a, b) => toDateValue(b.current_period_end) - toDateValue(a.current_period_end))
    .slice(0, 10)
    .map((org) => ({
      org_name: org.name,
      subscription_status: org.subscription_status,
      current_period_end: org.current_period_end
    }))

  const topOrganizationsByVotes = organizations
    .map((org) => ({
      org_name: org.name,
      total_votes_cast: orgVoteTotals.get(org.id) ?? 0
    }))
    .sort((a, b) => b.total_votes_cast - a.total_votes_cast || a.org_name.localeCompare(b.org_name))
    .slice(0, 10)

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: {
        total_organizations: organizations.length,
        paid_active_organizations: statusCounts.PAID_ACTIVE,
        trial_organizations: statusCounts.TRIAL,
        inactive_canceled_organizations: statusCounts.INACTIVE_CANCELED,
        total_events: events.length,
        total_ballots: ballots.length,
        total_votes_cast: votes.length
      },
      charts: {
        subscription_status: statusCounts,
        organization_type: organizationTypeCounts,
        estimated_voting_size: votingSizeCounts
      },
      recent_signups: recentSignups,
      recent_subscriptions: recentSubscriptions,
      upcoming_events: upcomingEvents,
      top_organizations_by_vote_count: topOrganizationsByVotes,
      trial_funnel: {
        trial_orgs_total: trialOrgs.length,
        trial_orgs_with_event: trialWithEvent,
        trial_orgs_with_ballot: trialWithBallot,
        trial_orgs_converted_to_paid: convertedToPaid
      }
    })
  }
}
