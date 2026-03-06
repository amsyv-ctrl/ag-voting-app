import type { Handler } from '@netlify/functions'
import { supabaseAdmin } from './_supabase'

const SUPER_ADMIN_EMAIL = 'yvincent90@gmail.com'
const STARTER_ALLOWANCE = 500
const GROWTH_ALLOWANCE = 2000
const NETWORK_ALLOWANCE = 5000

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
  stripe_customer_id: string | null
  stripe_price_id: string | null
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

function planFromOrg(org: OrganizationRow) {
  if (org.mode === 'TRIAL') return 'TRIAL'
  if (org.stripe_price_id && org.stripe_price_id === process.env.STRIPE_PRICE_STARTER) return 'STARTER'
  if (org.stripe_price_id && org.stripe_price_id === process.env.STRIPE_PRICE_GROWTH) return 'GROWTH'
  if (org.stripe_price_id && org.stripe_price_id === process.env.STRIPE_PRICE_NETWORK) return 'NETWORK'
  return 'UNKNOWN'
}

function allowanceFromPlan(plan: string, org: OrganizationRow) {
  if (plan === 'STARTER') return STARTER_ALLOWANCE
  if (plan === 'GROWTH') return GROWTH_ALLOWANCE
  if (plan === 'NETWORK') return NETWORK_ALLOWANCE
  if (plan === 'TRIAL') return org.trial_event_id ? 100 : 100
  return 0
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
      .select('id,name,created_at,mode,is_active,organization_type,estimated_voting_size,subscription_status,current_period_end,stripe_customer_id,stripe_price_id,stripe_subscription_id,trial_event_id')
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

  const { data: usageRows, error: usageError } = await supabaseAdmin
    .from('org_vote_usage')
    .select('org_id,billing_period_start,vote_count')
  if (usageError) {
    return { statusCode: 500, body: JSON.stringify({ error: usageError.message }) }
  }

  const { data: overageRows, error: overageError } = await supabaseAdmin
    .from('org_vote_overage')
    .select('org_id,billing_period_start,overage_votes,estimated_overage_cents')
  if (overageError) {
    return { statusCode: 500, body: JSON.stringify({ error: overageError.message }) }
  }

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

  const latestUsageByOrg = new Map<string, { vote_count: number; billing_period_start: string }>()
  for (const row of usageRows ?? []) {
    const current = latestUsageByOrg.get(row.org_id)
    if (!current || toDateValue(row.billing_period_start) > toDateValue(current.billing_period_start)) {
      latestUsageByOrg.set(row.org_id, {
        vote_count: row.vote_count,
        billing_period_start: row.billing_period_start
      })
    }
  }

  const latestOverageByOrg = new Map<string, { overage_votes: number; estimated_overage_cents: number; billing_period_start: string }>()
  for (const row of overageRows ?? []) {
    const current = latestOverageByOrg.get(row.org_id)
    if (!current || toDateValue(row.billing_period_start) > toDateValue(current.billing_period_start)) {
      latestOverageByOrg.set(row.org_id, {
        overage_votes: row.overage_votes,
        estimated_overage_cents: row.estimated_overage_cents,
        billing_period_start: row.billing_period_start
      })
    }
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
  const voteOrgs = new Set<string>()
  for (const [orgId, count] of orgVoteTotals.entries()) {
    if (count > 0) voteOrgs.add(orgId)
  }

  const trialOrgs = organizations.filter((org) => org.mode === 'TRIAL')
  const trialWithEvent = trialOrgs.filter((org) => eventsByOrg.has(org.id)).length
  const trialWithBallot = trialOrgs.filter((org) => ballotsByOrg.has(org.id)).length
  const trialWithVote = trialOrgs.filter((org) => voteOrgs.has(org.id)).length
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
      org_id: org.id,
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
      org_id: org.id,
      org_name: org.name,
      subscription_status: org.subscription_status,
      current_period_end: org.current_period_end
    }))

  const topOrganizationsByVotes = organizations
    .map((org) => ({
      org_id: org.id,
      org_name: org.name,
      total_votes_cast: orgVoteTotals.get(org.id) ?? 0
    }))
    .sort((a, b) => b.total_votes_cast - a.total_votes_cast || a.org_name.localeCompare(b.org_name))
    .slice(0, 10)

  const billingIssues = organizations.flatMap((org) => {
    const issues: Array<{
      org_id: string
      org_name: string
      issue: string
      subscription_status: string | null
      current_period_end: string | null
    }> = []
    const currentPeriod = toDateValue(org.current_period_end)
    if (org.subscription_status === 'past_due' || org.subscription_status === 'unpaid') {
      issues.push({
        org_id: org.id,
        org_name: org.name,
        issue: 'Billing past due / unpaid',
        subscription_status: org.subscription_status,
        current_period_end: org.current_period_end
      })
    }
    if (org.subscription_status === 'canceled' && org.is_active && !Number.isNaN(currentPeriod) && currentPeriod > now) {
      issues.push({
        org_id: org.id,
        org_name: org.name,
        issue: 'Canceled but active until period end',
        subscription_status: org.subscription_status,
        current_period_end: org.current_period_end
      })
    }
    if (org.mode === 'PAID' && (!org.stripe_customer_id || !org.stripe_subscription_id)) {
      issues.push({
        org_id: org.id,
        org_name: org.name,
        issue: 'Paid org missing Stripe identifiers',
        subscription_status: org.subscription_status,
        current_period_end: org.current_period_end
      })
    }
    return issues
  })

  const usageWarnings = organizations
    .map((org) => {
      const plan = planFromOrg(org)
      const allowance = allowanceFromPlan(plan, org)
      const usage = latestUsageByOrg.get(org.id)
      const overage = latestOverageByOrg.get(org.id)
      const used = usage?.vote_count ?? 0
      const warning = allowance > 0 && used / allowance >= 0.8
      const inOverage = (overage?.overage_votes ?? 0) > 0
      return {
        org_id: org.id,
        org_name: org.name,
        plan_name: plan,
        votes_used: used,
        allowance,
        overage_votes: overage?.overage_votes ?? 0,
        estimated_overage_cents: overage?.estimated_overage_cents ?? 0,
        warning_80: warning,
        in_overage: inOverage
      }
    })
    .filter((row) => row.warning_80 || row.in_overage)
    .sort((a, b) => (b.overage_votes - a.overage_votes) || (b.votes_used - a.votes_used))

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
      billing_issues: billingIssues,
      usage_warnings: usageWarnings,
      trial_funnel: {
        trial_orgs_total: trialOrgs.length,
        trial_orgs_with_event: trialWithEvent,
        trial_orgs_with_ballot: trialWithBallot,
        trial_orgs_with_vote: trialWithVote,
        trial_orgs_converted_to_paid: convertedToPaid
      }
    })
  }
}
