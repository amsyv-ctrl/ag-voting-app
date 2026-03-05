import { ReactNode, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type AdminHeaderProps = {
  breadcrumbText?: string | null
  actions?: ReactNode
  onSignOut?: () => Promise<void> | void
}

export function AdminHeader({ breadcrumbText, actions, onSignOut }: AdminHeaderProps) {
  const navigate = useNavigate()
  const [welcome, setWelcome] = useState('Welcome')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const firstItemRef = useRef<HTMLAnchorElement | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      const user = sessionData.session?.user
      if (!user || !mounted) return

      const { data: profile } = await supabase
        .from('admin_profiles')
        .select('first_name')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!mounted) return
      const first = typeof profile?.first_name === 'string' ? profile.first_name.trim() : ''
      if (first) {
        setWelcome(`Welcome, ${first}`)
      } else {
        const metadataFirst = typeof user.user_metadata?.first_name === 'string'
          ? user.user_metadata.first_name.trim()
          : ''
        if (metadataFirst) setWelcome(`Welcome, ${metadataFirst}`)
      }
    })()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    firstItemRef.current?.focus()

    const onDoc = (ev: MouseEvent) => {
      if (!menuRef.current) return
      if (!menuRef.current.contains(ev.target as Node)) setMenuOpen(false)
    }
    const onEsc = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setMenuOpen(false)
    }

    window.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onEsc)
    return () => {
      window.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onEsc)
    }
  }, [menuOpen])

  async function handleSignOut() {
    setMenuOpen(false)
    if (onSignOut) {
      await onSignOut()
      return
    }
    await supabase.auth.signOut()
    navigate('/admin')
  }

  return (
    <header className="admin-topbar">
      <div className="admin-topbar-inner">
        <Link to="/admin" className="admin-brand-wrap">
          <span className="admin-brand">MinistryVote</span>
          <span className="admin-brand-tagline">Verifiable voting for ministry governance</span>
        </Link>

        <div className="admin-topbar-center">
          {breadcrumbText ? <span className="admin-topbar-title">{breadcrumbText}</span> : null}
        </div>

        <div className="admin-topbar-right">
          {actions ? <div className="admin-topbar-actions">{actions}</div> : null}
          <div className="admin-menu-wrap" ref={menuRef}>
            <button
              type="button"
              className="btn btn-secondary admin-menu-toggle"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              {welcome}
            </button>
            {menuOpen && (
              <div className="admin-menu" role="menu">
                <Link ref={firstItemRef} to="/admin" onClick={() => setMenuOpen(false)} role="menuitem">Events</Link>
                <Link to="/admin/org" onClick={() => setMenuOpen(false)} role="menuitem">Account</Link>
                <Link to="/admin/org#subscription" onClick={() => setMenuOpen(false)} role="menuitem">Billing</Link>
                <button type="button" role="menuitem" onClick={handleSignOut}>Sign out</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
