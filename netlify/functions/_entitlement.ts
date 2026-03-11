import { supabaseAdmin } from './_supabase'

type Role = 'OWNER' | 'ADMIN' | 'STAFF'
type Mode = 'DEMO' | 'TRIAL' | 'PAID'

type OrgRow = {
  id: string
  mode: Mode
  is_active: boolean
  trial_event_id: string | null
  trial_votes_used: number
  trial_votes_limit: number
}

export type Entitlement = {
  userId: string
  orgId: string
  role: Role
  org: OrgRow
  canCreateEvents: boolean
  isReadOnly: boolean
  reason: string
  canOperateEvent: (eventId: string) => Promise<{ allowed: boolean; reason: string }>
}

export async function getEntitlementFromAuthHeader(authHeader: string | undefined): Promise<Entitlement | null> {
  const token = authHeader?.replace('Bearer ', '').trim()
  if (!token) return null

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
  if (userError || !userData.user) return null

  const userId = userData.user.id
  const { data: membership } = await supabaseAdmin
    .from('org_members')
    .select('org_id,role')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!membership?.org_id) return null

  const { data: orgData, error: orgError } = await supabaseAdmin
    .from('organizations')
    .select('id,mode,is_active,trial_event_id,trial_votes_used,trial_votes_limit')
    .eq('id', membership.org_id)
    .single()

  if (orgError || !orgData) return null

  const org = orgData as OrgRow
  const role = ((membership.role as Role) ?? 'OWNER')
  const isOrgAdmin = role === 'OWNER' || role === 'ADMIN'
  const isPaidActive = org.mode === 'PAID' && org.is_active
  const isTrialOpenForOneEvent =
    org.mode === 'TRIAL' &&
    org.trial_event_id == null &&
    org.trial_votes_used < org.trial_votes_limit

  const canCreateEvents = isOrgAdmin && (isPaidActive || isTrialOpenForOneEvent)
  const isReadOnly = !(isPaidActive || (org.mode === 'TRIAL' && org.trial_votes_used < org.trial_votes_limit))
  const reason = isPaidActive
    ? 'PAID_ACTIVE'
    : isTrialOpenForOneEvent
      ? 'TRIAL_NOT_STARTED'
      : isReadOnly
        ? 'READ_ONLY'
        : 'TRIAL_ACTIVE'

  return {
    userId,
    orgId: org.id,
    role,
    org,
    canCreateEvents,
    isReadOnly,
    reason,
    canOperateEvent: async (eventId: string) => {
      if (!isOrgAdmin) return { allowed: false, reason: 'INSUFFICIENT_ROLE' }
      if (isPaidActive) return { allowed: true, reason: 'PAID_ACTIVE' }

      const { data: eventRow } = await supabaseAdmin
        .from('events')
        .select('id,org_id,is_trial_event')
        .eq('id', eventId)
        .maybeSingle()

      if (!eventRow || eventRow.org_id !== org.id) return { allowed: false, reason: 'EVENT_NOT_IN_ORG' }

      if (
        org.mode === 'TRIAL' &&
        org.trial_event_id === eventId &&
        eventRow.is_trial_event === true &&
        org.trial_votes_used < org.trial_votes_limit
      ) {
        return { allowed: true, reason: 'TRIAL_EVENT_ALLOWED' }
      }

      return { allowed: false, reason: 'READ_ONLY' }
    }
  }
}
