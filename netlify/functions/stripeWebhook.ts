import type { Handler } from '@netlify/functions'
import Stripe from 'stripe'
import { supabaseAdmin } from './_supabase'

const stripeSecretKey = process.env.STRIPE_SECRET_KEY
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

if (!stripeSecretKey || !webhookSecret) {
  throw new Error('Missing Stripe webhook environment variables')
}

const stripe = new Stripe(stripeSecretKey)

function toIsoFromUnix(value: number | null | undefined) {
  if (!value) return null
  return new Date(value * 1000).toISOString()
}

function decodeBody(event: Parameters<Handler>[0]) {
  const raw = event.body || ''
  if (event.isBase64Encoded) {
    return Buffer.from(raw, 'base64')
  }
  return Buffer.from(raw, 'utf8')
}

async function updateOrgByOrgId(orgId: string, patch: Record<string, unknown>) {
  const { error } = await supabaseAdmin.from('organizations').update(patch).eq('id', orgId)
  if (error) {
    console.error('stripeWebhook updateOrgByOrgId failed', { orgId, error: error.message, patch })
  }
}

async function updateOrgByCustomerId(customerId: string, patch: Record<string, unknown>) {
  const { error } = await supabaseAdmin.from('organizations').update(patch).eq('stripe_customer_id', customerId)
  if (error) {
    console.error('stripeWebhook updateOrgByCustomerId failed', { customerId, error: error.message, patch })
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const signature = event.headers['stripe-signature'] || event.headers['Stripe-Signature']
  if (!signature) {
    return { statusCode: 400, body: 'Missing stripe-signature header' }
  }

  let stripeEvent: Stripe.Event
  try {
    stripeEvent = stripe.webhooks.constructEvent(decodeBody(event), signature, webhookSecret)
  } catch (err) {
    console.error('stripeWebhook signature verification failed', err)
    return { statusCode: 400, body: 'Invalid signature' }
  }

  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object as Stripe.Checkout.Session
        const orgId = session.metadata?.org_id || null
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id || null
        const subscriptionId = typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id || null

        let currentPeriodEnd: string | null = null
        let status = 'active'
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId)
          currentPeriodEnd = toIsoFromUnix(subscription.current_period_end)
          status = subscription.status
        }

        const patch = {
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          subscription_status: status,
          current_period_end: currentPeriodEnd,
          mode: 'PAID',
          is_active: status === 'active' || status === 'trialing'
        }

        if (orgId) {
          await updateOrgByOrgId(orgId, patch)
        } else if (customerId) {
          await updateOrgByCustomerId(customerId, patch)
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = stripeEvent.data.object as Stripe.Subscription
        const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
        const orgId = subscription.metadata?.org_id || null
        const status = subscription.status

        const patch = {
          stripe_subscription_id: subscription.id,
          subscription_status: status,
          current_period_end: toIsoFromUnix(subscription.current_period_end),
          mode: 'PAID',
          is_active: status === 'active' || status === 'trialing'
        }

        if (orgId) {
          await updateOrgByOrgId(orgId, patch)
        } else {
          await updateOrgByCustomerId(customerId, patch)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = stripeEvent.data.object as Stripe.Subscription
        const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
        const orgId = subscription.metadata?.org_id || null
        const patch = {
          stripe_subscription_id: subscription.id,
          subscription_status: 'canceled',
          current_period_end: toIsoFromUnix(subscription.current_period_end),
          is_active: false
        }
        if (orgId) {
          await updateOrgByOrgId(orgId, patch)
        } else {
          await updateOrgByCustomerId(customerId, patch)
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = stripeEvent.data.object as Stripe.Invoice
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id || null
        const subscriptionId = typeof invoice.subscription === 'string'
          ? invoice.subscription
          : invoice.subscription?.id || null

        const patch = {
          stripe_subscription_id: subscriptionId,
          subscription_status: 'past_due',
          is_active: false
        }

        if (customerId) {
          await updateOrgByCustomerId(customerId, patch)
        }
        break
      }

      default:
        console.log('stripeWebhook unhandled event type', stripeEvent.type)
    }
  } catch (err) {
    console.error('stripeWebhook handler error', { type: stripeEvent.type, error: err })
  }

  return { statusCode: 200, body: 'ok' }
}

