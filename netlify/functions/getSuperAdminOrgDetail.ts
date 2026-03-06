import type { Handler } from '@netlify/functions'
import { supabaseAdmin } from './_supabase'

const SUPER_ADMIN_EMAIL = 'yvincent90@gmail.com'
const STARTER_ALLOWANCE = 500
const GROWTH_ALLOWANCE = 2000
const NETWORK_ALLOWANCE = 5000

function toDateValue(value: string | null) {
  if (!value) return Number.NaN
  const date = new Date(value)
  return date.getTime()
}

function planFromOrg(org: { mode: string; stripe_price_id: string | null }) {
  if (org.mode === 'TRIAL') return 'TRIAL'
  if (org.stripe_price_id && org.stripe_price_id === process.env.STRIPE_PRICE_STARTER) return 'STARTER'
  if (org.stripe_price_id && org.stripe_price_id === process.env.STRIPE_PRICE_GROWTH) return 'GROWTH'
  if (org.stripe_price_id && org.stripe_price_id === process.env.STRIPE_PRICE_NETWORK) return 'NETWORK'
  return 'UNKNOWN'
}

function allowanceFromPlan(plan: string, org: { trial_votes_limit: number | null }) {
  if (plan === 'STARTER') return STARTER_ALLOWANCE
  if (plan === 'GROWTH') return GROWTH_ALLOWANCE
  if (plan === 'NETWORK') return NETWORK_ALLOWANCE
  if (plan === 'TRIAL') return org.trial_votes_limit ?? 100
  return 0
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const token = event.headers.authorization?.replace('Bearer ', '').trim()
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  const orgId = event.queryStringParameters?.orgId?.trim()
  if (!orgId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'orgId is required' }) }
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
  const user = userData.user
  if (userError || !user || (user.email ?? '').toLowerCase() !== SUPER_ADMIN_EMAIL) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) }
  }

  const [{ data: orgRow, error: orgError }, { data: eventRows, error: eventError }, { data: usageRows, error: usageError }, { data: overageRows, error: overageError }, { data: auditRows, error: auditError }] = await Promise.all([
    supabaseAdmin
      .from('organizations')
      .select('id,name,mode,is_active,subscription_status,current_period_end,stripe_customer_id,stripe_subscription_id,stripe_price_id,organization_type,estimated_voting_size,trial_votes_limit,internal_notes')
      .eq('id', orgId)
      .maybeSingle(),
    supabaseAdmin
      .from('events')
      .select('id,name,date,location,org_id')
      .eq('org_id', orgId)
      .order('date', { ascending: true }),
    supabaseAdmin
      .from('org_vote_usage')
      .select('org_id,billing_period_start,vote_count')
      .eq('org_id', orgId),
    supabaseAdmin
      .from('org_vote_overage')
      .select('org_id,billing_period_start,overage_votes,estimated_overage_cents')
      .eq('org_id', orgId),
    supabaseAdmin
      .from('election_audit_log')
      .select('action,created_at,event_id,ballot_id,metadata,actor_user_id')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(15)
  ])

  if (orgError || !orgRow) return { statusCode: 404, body: JSON.stringify({ error: orgError?.message ?? 'Organization not found' }) }
  if (eventError) return { statusCode: 500, body: JSON.stringify({ error: eventError.message }) }
  if (usageError) return { statusCode: 500, body: JSON.stringify({ error: usageError.message }) }
  if (overageError) return { statusCode: 500, body: JSON.stringify({ error: overageError.message }) }
  if (auditError) return { statusCode: 500, body: JSON.stringify({ error: auditError.message }) }

  const events = eventRows ?? []
  const eventIds = events.map((row) => row.id)

  const [{ data: ballotRows, error: ballotError }, { data: voteRows, error: voteError }] = await Promise.all([
    eventIds.length > 0
      ? supabaseAdmin.from('ballots').select('id,event_id').in('event_id', eventIds).is('deleted_at', null)
      : Promise.resolve({ data: [], error: null }),
    eventIds.length > 0
      ? supabaseAdmin.from('votes').select('id,ballot_id')
      : Promise.resolve({ data: [], error: null })
  ])

  if (ballotError) return { statusCode: 500, body: JSON.stringify({ error: ballotError.message }) }
  if (voteError) return { statusCode: 500, body: JSON.stringify({ error: voteError.message }) }

  const ballots = ballotRows ?? []
  const ballotIds = new Set(ballots.map((row) => row.id))
  const totalVotes = (voteRows ?? []).filter((vote) => ballotIds.has(vote.ballot_id)).length

  const latestUsage = (usageRows ?? []).sort((a, b) => toDateValue(b.billing_period_start) - toDateValue(a.billing_period_start))[0]
  const latestOverage = (overageRows ?? []).sort((a, b) => toDateValue(b.billing_period_start) - toDateValue(a.billing_period_start))[0]
  const planName = planFromOrg(orgRow)
  const allowance = allowanceFromPlan(planName, orgRow)
  const votesUsed = latestUsage?.vote_count ?? 0

  const now = Date.now()
  const upcomingEvents = events
    .filter((evt) => {
      const dateValue = toDateValue(evt.date)
      return !Number.isNaN(dateValue) && dateValue >= now
    })
    .slice(0, 10)

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      org: orgRow,
      stats: {
        total_events: events.length,
        total_ballots: ballots.length,
        total_votes_cast: totalVotes,
        plan_name: planName,
        allowance,
        votes_used: votesUsed,
        overage_votes: latestOverage?.overage_votes ?? 0,
        estimated_overage_cents: latestOverage?.estimated_overage_cents ?? 0
      },
      recent_activity: auditRows ?? [],
      upcoming_events: upcomingEvents
    })
  }
}
