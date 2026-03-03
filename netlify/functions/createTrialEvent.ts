import type { Handler } from '@netlify/functions'
import { getEntitlementFromAuthHeader } from './_entitlement'
import { supabaseAdmin } from './_supabase'

function randomSuffix(length = 6) {
  return Math.random().toString(36).slice(2, 2 + length)
}

async function getExistingTrialBallotSlug(eventId: string) {
  const { data: ballot } = await supabaseAdmin
    .from('ballots')
    .select('slug')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return ballot?.slug ?? null
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const entitlement = await getEntitlementFromAuthHeader(event.headers.authorization)
  if (!entitlement) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  const orgId = entitlement.orgId
  const { data: org, error: orgError } = await supabaseAdmin
    .from('organizations')
    .select('id,trial_event_id')
    .eq('id', orgId)
    .single()

  if (orgError || !org) {
    return { statusCode: 404, body: JSON.stringify({ error: orgError?.message ?? 'Organization not found' }) }
  }

  if (org.trial_event_id) {
    const slug = await getExistingTrialBallotSlug(org.trial_event_id)
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: org.trial_event_id, slug })
    }
  }

  if (!entitlement.canCreateEvents) {
    console.warn('createTrialEvent denied', {
      userId: entitlement.userId,
      orgId: entitlement.orgId,
      reason: entitlement.reason
    })
    return { statusCode: 403, body: JSON.stringify({ error: 'Subscription inactive. Trial event cannot be created.' }) }
  }

  const today = new Date().toISOString().slice(0, 10)
  const { data: createdEvent, error: eventInsertError } = await supabaseAdmin
    .from('events')
    .insert({
      org_id: orgId,
      created_by: entitlement.userId,
      name: 'Free Trial Event',
      date: today,
      location: 'Trial',
      is_trial_event: true
    })
    .select('id')
    .single()

  if (eventInsertError || !createdEvent) {
    return { statusCode: 500, body: JSON.stringify({ error: eventInsertError?.message ?? 'Could not create trial event' }) }
  }

  let starterSlug: string | null = null
  const ballotSlug = `trial-${randomSuffix(8)}`
  const { data: createdBallot } = await supabaseAdmin
    .from('ballots')
    .insert({
      event_id: createdEvent.id,
      slug: ballotSlug,
      title: 'Test Ballot',
      description: 'Trial ballot to test voting workflow.',
      ballot_type: 'YES_NO',
      majority_rule: 'SIMPLE',
      status: 'DRAFT',
      requires_pin: false,
      results_visibility: 'LIVE'
    })
    .select('id,slug')
    .single()

  if (createdBallot?.id) {
    starterSlug = createdBallot.slug
    await supabaseAdmin.from('choices').insert([
      { ballot_id: createdBallot.id, label: 'Yes', sort_order: 1 },
      { ballot_id: createdBallot.id, label: 'No', sort_order: 2 }
    ])
  }

  // Idempotency guard: only claim trial_event_id if still null.
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from('organizations')
    .update({ trial_event_id: createdEvent.id, mode: 'TRIAL' })
    .eq('id', orgId)
    .is('trial_event_id', null)
    .select('trial_event_id')

  if (claimError) {
    return { statusCode: 500, body: JSON.stringify({ error: claimError.message }) }
  }

  const claimWon = Array.isArray(claimed) && claimed.length > 0
  if (!claimWon) {
    const { data: latestOrg } = await supabaseAdmin
      .from('organizations')
      .select('trial_event_id')
      .eq('id', orgId)
      .single()

    if (latestOrg?.trial_event_id) {
      await supabaseAdmin.from('events').delete().eq('id', createdEvent.id)
      const slug = await getExistingTrialBallotSlug(latestOrg.trial_event_id)
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: latestOrg.trial_event_id, slug })
      }
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId: createdEvent.id, slug: starterSlug })
  }
}
