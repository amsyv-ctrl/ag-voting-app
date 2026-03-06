const resendApiKey = process.env.RESEND_API_KEY
const resendFromEmail = process.env.RESEND_FROM_EMAIL

type SendEmailArgs = {
  to: string | string[]
  subject: string
  html: string
  text: string
  replyTo?: string
}

export function canSendResendEmail() {
  return !!(resendApiKey && resendFromEmail)
}

export async function sendResendEmail(args: SendEmailArgs) {
  if (!resendApiKey || !resendFromEmail) {
    throw new Error('Missing Resend environment variables')
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: resendFromEmail,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
      reply_to: args.replyTo
    })
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message =
      typeof data?.message === 'string'
        ? data.message
        : typeof data?.error?.message === 'string'
          ? data.error.message
          : 'Resend request failed'
    throw new Error(message)
  }

  return data
}
