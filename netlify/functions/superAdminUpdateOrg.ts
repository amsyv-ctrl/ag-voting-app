import type { Handler } from '@netlify/functions'
import { supabaseAdmin } from './_supabase'

const SUPER_ADMIN_EMAIL = 'yvincent90@gmail.com'

type Body = {
  orgId?: string
  mode?: 'TRIAL' | 'PAID' | 'INACTIVE'
  is_active?: boolean
  current_period_end?: string | null
  trial_votes_limit?: number | null
  internal_notes?: string | null
}

export const handler: Handler = async (event) => {
  try {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const token = event.headers.authorization?.replace('Bearer ', '').trim()
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
  const user = userData.user
  if (userError || !user || (user.email ?? '').toLowerCase() !== SUPER_ADMIN_EMAIL) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) }
  }

  let payload: Body = {}
  try {
    payload = JSON.parse(event.body || '{}') as Body
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON payload' }) }
  }

  const orgId = payload.orgId?.trim()
  if (!orgId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'orgId is required' }) }
  }

  let currentOrgQuery = await supabaseAdmin
    .from('organizations')
    .select('id,mode,is_active,current_period_end,trial_votes_limit,internal_notes')
    .eq('id', orgId)
    .maybeSingle()

  if (currentOrgQuery.error && /internal_notes/i.test(currentOrgQuery.error.message)) {
    currentOrgQuery = await supabaseAdmin
      .from('organizations')
      .select('id,mode,is_active,current_period_end,trial_votes_limit')
      .eq('id', orgId)
      .maybeSingle()
    if (currentOrgQuery.data) {
      currentOrgQuery.data = { ...currentOrgQuery.data, internal_notes: null }
    }
  }

  const { data: currentOrg, error: orgError } = currentOrgQuery

  if (orgError || !currentOrg) {
    return { statusCode: 404, body: JSON.stringify({ error: orgError?.message ?? 'Organization not found' }) }
  }

  const nextMode = payload.mode ?? currentOrg.mode
  const update: Record<string, unknown> = {}

  if (nextMode === 'TRIAL') {
    update.mode = 'TRIAL'
    update.is_active = payload.is_active ?? true
  } else if (nextMode === 'PAID') {
    update.mode = 'PAID'
    update.is_active = payload.is_active ?? true
  } else if (nextMode === 'INACTIVE') {
    update.is_active = false
  }

  if ('current_period_end' in payload) {
    update.current_period_end = payload.current_period_end || null
  }
  if ('trial_votes_limit' in payload && payload.trial_votes_limit != null) {
    update.trial_votes_limit = Math.max(1, Number(payload.trial_votes_limit))
  }
  if ('internal_notes' in payload) {
    update.internal_notes = payload.internal_notes?.trim() || null
  }
  if ('is_active' in payload && nextMode !== 'INACTIVE') {
    update.is_active = !!payload.is_active
  }

  let updatePayload = { ...update }
  let updatedOrgQuery = await supabaseAdmin
    .from('organizations')
    .update(updatePayload)
    .eq('id', orgId)
    .select('id,mode,is_active,current_period_end,trial_votes_limit,internal_notes')
    .single()

  if (updatedOrgQuery.error && /internal_notes/i.test(updatedOrgQuery.error.message)) {
    delete updatePayload.internal_notes
    updatedOrgQuery = await supabaseAdmin
      .from('organizations')
      .update(updatePayload)
      .eq('id', orgId)
      .select('id,mode,is_active,current_period_end,trial_votes_limit')
      .single()
    if (updatedOrgQuery.data) {
      updatedOrgQuery.data = { ...updatedOrgQuery.data, internal_notes: currentOrg.internal_notes }
    }
  }

  const { data: updatedOrg, error: updateError } = updatedOrgQuery

  if (updateError || !updatedOrg) {
    return { statusCode: 500, body: JSON.stringify({ error: updateError?.message ?? 'Update failed' }) }
  }

  await supabaseAdmin.from('election_audit_log').insert({
    org_id: orgId,
    event_id: null,
    ballot_id: null,
    action: 'SUPER_ADMIN_OVERRIDE',
    actor_user_id: user.id,
    metadata: {
      previous: {
        mode: currentOrg.mode,
        is_active: currentOrg.is_active,
        current_period_end: currentOrg.current_period_end,
        trial_votes_limit: currentOrg.trial_votes_limit,
        internal_notes: currentOrg.internal_notes
      },
      next: {
        mode: updatedOrg.mode,
        is_active: updatedOrg.is_active,
        current_period_end: updatedOrg.current_period_end,
        trial_votes_limit: updatedOrg.trial_votes_limit,
        internal_notes: updatedOrg.internal_notes
      }
    }
  })

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, org: updatedOrg })
  }
  } catch (err) {
    console.error('superAdminUpdateOrg failed', err)
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err instanceof Error ? err.message : 'Unexpected server error' })
    }
  }
}
