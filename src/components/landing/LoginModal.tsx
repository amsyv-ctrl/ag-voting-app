import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  EyeIcon,
  EyeSlashIcon,
  XMarkIcon
} from '@heroicons/react/24/outline'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { SectionMotion } from './SectionMotion'

type LoginModalProps = {
  open: boolean
  onClose: () => void
}

export function LoginModal({ open, onClose }: LoginModalProps) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onEsc)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onEsc)
    }
  }, [open, onClose])

  const passwordType = useMemo(() => (showPassword ? 'text' : 'password'), [showPassword])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password })
      if (loginError) {
        setError(loginError.message)
        return
      }
      onClose()
      navigate('/admin')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="presentation"
    >
      <SectionMotion zoom className="w-full max-w-md">
        <div className="glow-hover relative rounded-2xl border border-gray-700 bg-gray-900 p-8 shadow-2xl">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-8 top-8 text-gray-400 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
            aria-label="Close login modal"
          >
            <XMarkIcon className="h-8 w-8" />
          </button>

          <h2 className="mb-8 text-center text-3xl font-bold text-blue-400">Login to MinistryVote</h2>

          <form onSubmit={onSubmit}>
            <div className="mb-6">
              <label className="mb-2 block text-sm font-medium">Email</label>
              <input
                type="email"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                placeholder="you@church.org"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="relative mb-8">
              <label className="mb-2 block text-sm font-medium">Password</label>
              <input
                type={passwordType}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-4 top-10 text-gray-400 transition hover:text-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeIcon className="h-5 w-5" /> : <EyeSlashIcon className="h-5 w-5" />}
              </button>
            </div>
            <button
              type="submit"
              className="glow-hover w-full rounded-xl bg-blue-600 px-6 py-4 font-bold transition hover:bg-blue-700"
              disabled={loading}
            >
              {loading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
          {error && <p className="mt-4 text-center text-sm text-red-300">{error}</p>}
          <div className="mt-6 text-center text-sm">
            <a href="#" className="text-blue-400 transition hover:text-blue-300">Forgot password?</a>
            <span className="mx-3 text-gray-500">•</span>
            <Link to="/admin?mode=register" className="text-blue-400 transition hover:text-blue-300">Start Free Trial</Link>
          </div>
        </div>
      </SectionMotion>
    </div>
  )
}
