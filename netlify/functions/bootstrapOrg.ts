import type { Handler } from '@netlify/functions'
import { supabaseAdmin } from './_supabase'

type OrgRow = {
  id: string
  name: string
  mode: 'DEMO' | 'TRIAL' | 'PAID'
  stripe_customer_id: string | null
  stripe_price_id: string | null
  trial_event_id: string | null
  trial_votes_used: number
  trial_votes_limit: number
  subscription_status: string | null
  current_period_end: string | null
  is_active: boolean
}

type UsageSummary = {
  plan_name: 'STARTER' | 'GROWTH' | 'NETWORK' | 'TRIAL' | 'UNKNOWN'
  billing_period_start: string | null
  votes_used: number
  allowance: number
  remaining: number
  overage_votes: number
  estimated_overage_cents: number
  warning_80: boolean
}

const STARTER_ALLOWANCE = 500
const GROWTH_ALLOWANCE = 2000
const NETWORK_ALLOWANCE = 5000
const OVERAGE_RATE_CENTS = 50

function planFromOrg(org: OrgRow): UsageSummary['plan_name'] {
  if (org.mode === 'TRIAL') return 'TRIAL'
  if (org.stripe_price_id && org.stripe_price_id === process.env.STRIPE_PRICE_STARTER) return 'STARTER'
  if (org.stripe_price_id && org.stripe_price_id === process.env.STRIPE_PRICE_GROWTH) return 'GROWTH'
  if (org.stripe_price_id && org.stripe_price_id === process.env.STRIPE_PRICE_NETWORK) return 'NETWORK'
  return 'UNKNOWN'
}

function allowanceFromPlan(plan: UsageSummary['plan_name'], org: OrgRow) {
  if (plan === 'STARTER') return STARTER_ALLOWANCE
  if (plan === 'GROWTH') return GROWTH_ALLOWANCE
  if (plan === 'NETWORK') return NETWORK_ALLOWANCE
  if (plan === 'TRIAL') return Math.max(org.trial_votes_limit || 100, 0)
  return 0
}

function defaultOrgName(email: string | null | undefined) {
  const base = (email ?? 'organization').trim().toLowerCase()
  return `${base} org`
}

function pickString(input: unknown) {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  return trimmed.length > 0 ? trimmed : null
}

async function validateAdmin(authHeader: string | undefined) {
  const token = authHeader?.replace('Bearer ', '').trim()
  if (!token) return null

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data.user) return null
  return data.user
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const user = await validateAdmin(event.headers.authorization)
  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  const { data: membership } = await supabaseAdmin
    .from('org_members')
    .select('org_id,role')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  let org: OrgRow | null = null
  let role: 'OWNER' | 'ADMIN' | 'STAFF' = (membership?.role as 'OWNER' | 'ADMIN' | 'STAFF') ?? 'OWNER'

  if (membership?.org_id) {
    const { data: orgData, error: orgError } = await supabaseAdmin
      .from('organizations')
      .select('id,name,mode,stripe_customer_id,stripe_price_id,trial_event_id,trial_votes_used,trial_votes_limit,subscription_status,current_period_end,is_active')
      .eq('id', membership.org_id)
      .single()

    if (orgError || !orgData) {
      return { statusCode: 500, body: JSON.stringify({ error: orgError?.message ?? 'Organization lookup failed' }) }
    }
    org = orgData as OrgRow
  }

  if (!org) {
    const metadata = (user.user_metadata || {}) as Record<string, unknown>
    const organizationName = pickString(metadata.organization_name) ?? defaultOrgName(user.email)
    const signupRole = pickString(metadata.signup_role)
    const estimatedVotingSize = pickString(metadata.estimated_voting_size)
    const organizationType = pickString(metadata.organization_type)
    const country = pickString(metadata.country)
    const addressLine1 = pickString(metadata.address_line1)
    const addressLine2 = pickString(metadata.address_line2)
    const city = pickString(metadata.city)
    const stateRegion = pickString(metadata.state_region)
    const postalCode = pickString(metadata.postal_code)

    const { data: createdOrg, error: createOrgError } = await supabaseAdmin
      .from('organizations')
      .insert({
        name: organizationName,
        created_by: user.id,
        mode: 'TRIAL',
        is_active: false,
        signup_role: signupRole,
        estimated_voting_size: estimatedVotingSize,
        organization_type: organizationType,
        country,
        address_line1: addressLine1,
        address_line2: addressLine2,
        city,
        state_region: stateRegion,
        postal_code: postalCode
      })
      .select('id,name,mode,stripe_customer_id,stripe_price_id,trial_event_id,trial_votes_used,trial_votes_limit,subscription_status,current_period_end,is_active')
      .single()

    if (createOrgError || !createdOrg) {
      return { statusCode: 500, body: JSON.stringify({ error: createOrgError?.message ?? 'Could not create organization' }) }
    }

    const { error: memberInsertError } = await supabaseAdmin
      .from('org_members')
      .insert({
        org_id: createdOrg.id,
        user_id: user.id,
        role: 'OWNER'
      })

    if (memberInsertError) {
      return { statusCode: 500, body: JSON.stringify({ error: memberInsertError.message }) }
    }

    org = createdOrg as OrgRow
    role = 'OWNER'
  }

  const planName = planFromOrg(org)
  const allowance = allowanceFromPlan(planName, org)

  const { data: usageRows, error: usageError } = await supabaseAdmin.rpc('get_org_vote_usage', {
    p_org_id: org.id,
    p_allowance: allowance,
    p_overage_rate_cents: OVERAGE_RATE_CENTS
  })

  if (usageError) {
    return { statusCode: 500, body: JSON.stringify({ error: usageError.message }) }
  }

  const usageRow = (Array.isArray(usageRows) ? usageRows[0] : usageRows) ?? null
  const usage: UsageSummary = {
    plan_name: planName,
    billing_period_start: usageRow?.billing_period_start ?? null,
    votes_used: usageRow?.vote_count ?? 0,
    allowance: usageRow?.allowance ?? allowance,
    remaining: usageRow?.remaining ?? Math.max(allowance, 0),
    overage_votes: usageRow?.overage_votes ?? 0,
    estimated_overage_cents: usageRow?.estimated_overage_cents ?? 0,
    warning_80: !!usageRow?.warning_80
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ org, role, usage, created: !membership?.org_id })
  }
}
