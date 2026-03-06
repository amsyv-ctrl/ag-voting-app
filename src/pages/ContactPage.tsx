import { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { PublicPageHero } from '../components/landing/PublicPageHero'
import { PublicSiteLayout } from '../components/landing/PublicSiteLayout'
import { submitContactForm } from '../lib/api'

export function ContactPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [organization, setOrganization] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setSuccess(null)
    setError(null)

    try {
      await submitContactForm({ name, email, organization, message })
      setSuccess('Message sent. We’ll get back to you within 2–3 business days.')
      setName('')
      setEmail('')
      setOrganization('')
      setMessage('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PublicSiteLayout>
      <PublicPageHero
        title="Contact Us"
        subtitle="Have a question about MinistryVote or want help thinking through your voting setup? Send us a message and we’ll get back to you. Responses typically within 2–3 business days."
      />

      <section className="mx-auto mt-8 w-full max-w-3xl rounded-2xl border border-gray-800 bg-gray-900/70 p-8 shadow-2xl">

        <form onSubmit={onSubmit} className="grid gap-5">
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-gray-200">Name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-gray-200">Email</span>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-gray-200">Organization</span>
            <input className="input" value={organization} onChange={(e) => setOrganization(e.target.value)} />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-gray-200">Message</span>
            <textarea className="textarea" value={message} onChange={(e) => setMessage(e.target.value)} required />
          </label>

          {success ? <p className="winner">{success}</p> : null}
          {error ? <p className="error">{error}</p> : null}

          <div className="flex flex-wrap gap-3">
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Sending...' : 'Send Message'}
            </button>
            <Link to="/" className="btn btn-secondary no-underline">Back to Home</Link>
          </div>
        </form>
      </section>
    </PublicSiteLayout>
  )
}
