import type { Handler } from '@netlify/functions'
import { supabaseAdmin } from './_supabase'

type OrgRow = {
  id: string
  name: string
  mode: 'DEMO' | 'TRIAL' | 'PAID'
  trial_event_id: string | null
  trial_votes_used: number
  trial_votes_limit: number
  subscription_status: string | null
  current_period_end: string | null
  is_active: boolean
}

function defaultOrgName(email: string | null | undefined) {
  const base = (email ?? 'organization').trim().toLowerCase()
  return `${base} org`
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
      .select('id,name,mode,trial_event_id,trial_votes_used,trial_votes_limit,subscription_status,current_period_end,is_active')
      .eq('id', membership.org_id)
      .single()

    if (orgError || !orgData) {
      return { statusCode: 500, body: JSON.stringify({ error: orgError?.message ?? 'Organization lookup failed' }) }
    }
    org = orgData as OrgRow
  }

  if (!org) {
    const { data: createdOrg, error: createOrgError } = await supabaseAdmin
      .from('organizations')
      .insert({
        name: defaultOrgName(user.email),
        created_by: user.id,
        mode: 'TRIAL',
        is_active: false
      })
      .select('id,name,mode,trial_event_id,trial_votes_used,trial_votes_limit,subscription_status,current_period_end,is_active')
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

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ org, role, created: !membership?.org_id })
  }
}
