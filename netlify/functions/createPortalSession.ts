import type { Handler } from '@netlify/functions'
import Stripe from 'stripe'
import { supabaseAdmin } from './_supabase'

const stripeSecretKey = process.env.STRIPE_SECRET_KEY
const siteUrlEnv = process.env.SITE_URL

if (!stripeSecretKey) {
  throw new Error('Missing STRIPE_SECRET_KEY')
}

const stripe = new Stripe(stripeSecretKey)

function resolveBaseUrl(event: Parameters<Handler>[0]) {
  const envBase = siteUrlEnv?.trim()
  if (envBase) return envBase.replace(/\/+$/, '')

  const origin = event.headers.origin?.trim()
  if (origin) return origin.replace(/\/+$/, '')

  return 'https://agvoting.com'
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

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (membershipError || !membership?.org_id) {
    return { statusCode: 403, body: JSON.stringify({ error: membershipError?.message ?? 'No organization found for user' }) }
  }

  const { data: org, error: orgError } = await supabaseAdmin
    .from('organizations')
    .select('id,stripe_customer_id')
    .eq('id', membership.org_id)
    .single()

  if (orgError || !org) {
    return { statusCode: 404, body: JSON.stringify({ error: orgError?.message ?? 'Organization not found' }) }
  }

  if (!org.stripe_customer_id) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No Stripe customer found for this organization' }) }
  }

  const baseUrl = resolveBaseUrl(event)
  const returnUrl = `${baseUrl}/admin/org`

  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: returnUrl
  })

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: session.url })
  }
}
