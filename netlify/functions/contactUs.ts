import type { Handler } from '@netlify/functions'
import { sendResendEmail } from './_resend'

type Body = {
  name?: string
  email?: string
  organization?: string
  message?: string
}

const CONTACT_TO = 'yvincent90@gmail.com'

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  let payload: Body = {}
  try {
    payload = JSON.parse(event.body || '{}') as Body
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON payload' }) }
  }

  const name = payload.name?.trim() || ''
  const email = payload.email?.trim() || ''
  const organization = payload.organization?.trim() || ''
  const message = payload.message?.trim() || ''

  if (!name || !email || !message) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Name, email, and message are required.' }) }
  }

  const submittedAt = new Date().toISOString()

  try {
    await sendResendEmail({
      to: CONTACT_TO,
      subject: `MinistryVote Contact Form — ${name}`,
      replyTo: email,
      html: `
        <h1>New MinistryVote contact form message</h1>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Organization:</strong> ${escapeHtml(organization || 'N/A')}</p>
        <p><strong>Submitted at:</strong> ${escapeHtml(submittedAt)}</p>
        <p><strong>Message:</strong></p>
        <p>${escapeHtml(message).replaceAll('\n', '<br />')}</p>
      `,
      text: [
        'New MinistryVote contact form message',
        `Name: ${name}`,
        `Email: ${email}`,
        `Organization: ${organization || 'N/A'}`,
        `Submitted at: ${submittedAt}`,
        '',
        'Message:',
        message
      ].join('\n')
    })

    console.log('contactUs sent', { email, organization: organization || null })

    try {
      await sendResendEmail({
        to: email,
        subject: 'We received your message',
        html: `
          <p>Hi ${escapeHtml(name)},</p>
          <p>We received your message and will get back to you.</p>
          <p>Responses typically within 2–3 business days.</p>
          <p>MinistryVote</p>
        `,
        text: [
          `Hi ${name},`,
          '',
          'We received your message and will get back to you.',
          'Responses typically within 2–3 business days.',
          '',
          'MinistryVote'
        ].join('\n')
      })
    } catch (confirmationError) {
      console.error('contactUs confirmation failed', confirmationError)
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true })
    }
  } catch (err) {
    console.error('contactUs failed', err)
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Something went wrong. Please try again.' })
    }
  }
}
