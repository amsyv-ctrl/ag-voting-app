import type { Handler } from '@netlify/functions'
import Stripe from 'stripe'
import { supabaseAdmin } from './_supabase'

type Body = {
  plan?: 'STARTER' | 'GROWTH' | 'NETWORK'
}

const stripeSecretKey = process.env.STRIPE_SECRET_KEY
const priceStarter = process.env.STRIPE_PRICE_STARTER
const priceGrowth = process.env.STRIPE_PRICE_GROWTH
const priceNetwork = process.env.STRIPE_PRICE_NETWORK
const successUrlEnv = process.env.STRIPE_SUCCESS_URL
const cancelUrlEnv = process.env.STRIPE_CANCEL_URL

if (!stripeSecretKey) {
  throw new Error('Missing STRIPE_SECRET_KEY')
}

const stripe = new Stripe(stripeSecretKey)

function getPriceId(plan: Body['plan']) {
  if (plan === 'GROWTH') return priceGrowth
  if (plan === 'NETWORK') return priceNetwork
  return priceStarter
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

  let payload: Body = {}
  try {
    payload = JSON.parse(event.body || '{}') as Body
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON payload' }) }
  }

  const priceId = getPriceId(payload.plan)
  if (!priceId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing Stripe price configuration for selected plan' }) }
  }

  const { data: membership, error: memberError } = await supabaseAdmin
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (memberError || !membership?.org_id) {
    return { statusCode: 403, body: JSON.stringify({ error: memberError?.message ?? 'No organization found for user' }) }
  }

  const orgId = membership.org_id
  const { data: org, error: orgError } = await supabaseAdmin
    .from('organizations')
    .select('id,name,stripe_customer_id')
    .eq('id', orgId)
    .single()

  if (orgError || !org) {
    return { statusCode: 404, body: JSON.stringify({ error: orgError?.message ?? 'Organization not found' }) }
  }

  let customerId = org.stripe_customer_id as string | null
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: org.name ?? undefined,
      metadata: { org_id: org.id }
    })
    customerId = customer.id

    const { error: customerSaveError } = await supabaseAdmin
      .from('organizations')
      .update({ stripe_customer_id: customerId })
      .eq('id', org.id)

    if (customerSaveError) {
      return { statusCode: 500, body: JSON.stringify({ error: customerSaveError.message }) }
    }
  }

  const origin = event.headers.origin || event.headers.referer || 'https://example.com'
  const fallbackBase = origin.replace(/\/+$/, '')
  const successUrl = successUrlEnv || `${fallbackBase}/admin/org?billing=success`
  const cancelUrl = cancelUrlEnv || `${fallbackBase}/admin/org?billing=cancel`

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { org_id: org.id },
    subscription_data: {
      metadata: { org_id: org.id }
    }
  })

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: session.url })
  }
}
