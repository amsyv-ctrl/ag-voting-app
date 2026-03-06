import { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
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
    <main className="landing-root min-h-screen bg-gray-950 px-6 pb-16 pt-28 text-gray-100">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 border-b border-gray-800 pb-4">
        <Link to="/" className="no-underline">
          <div className="flex flex-col">
            <span className="text-2xl font-bold text-blue-400 transition hover:text-blue-300">MinistryVote</span>
            <span className="text-xs text-gray-400">Verifiable voting for ministry governance</span>
          </div>
        </Link>
        <div className="flex items-center gap-4">
          <Link to="/" className="text-blue-300 no-underline transition hover:text-blue-200">Home</Link>
          <Link to="/admin" className="rounded-lg bg-blue-600 px-5 py-2 font-medium text-white no-underline transition hover:bg-blue-700">Login</Link>
        </div>
      </div>

      <section className="mx-auto mt-10 w-full max-w-3xl rounded-2xl border border-gray-800 bg-gray-900/70 p-8 shadow-2xl">
        <h1 className="mb-4 text-4xl font-bold text-white">Contact Us</h1>
        <p className="mb-8 max-w-2xl text-lg leading-relaxed text-gray-300">
          Have a question about MinistryVote or want help thinking through your voting setup?
          Send us a message and we’ll get back to you.
          Responses typically within 2–3 business days.
        </p>

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
    </main>
  )
}
