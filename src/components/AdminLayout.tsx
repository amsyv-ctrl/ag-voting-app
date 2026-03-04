import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type AdminLayoutProps = {
  children: ReactNode
  breadcrumb?: string[]
  onSignOut?: () => Promise<void> | void
}

export function AdminLayout({ children, breadcrumb, onSignOut }: AdminLayoutProps) {
  const navigate = useNavigate()
  const [welcome, setWelcome] = useState('Welcome')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

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
      } else if (user.email) {
        setWelcome(`Welcome, ${user.email}`)
      }
    })()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) return
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

  const breadcrumbText = useMemo(() => (breadcrumb && breadcrumb.length ? breadcrumb.join(' > ') : null), [breadcrumb])

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
    <main className="admin-shell">
      <header className="admin-topbar">
        <div className="admin-topbar-inner">
          <Link to="/" className="admin-brand">AG Voting</Link>
          <div className="admin-menu-wrap" ref={menuRef}>
            <button
              type="button"
              className="secondary admin-menu-toggle"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              Menu
            </button>
            {menuOpen && (
              <div className="admin-menu" role="menu">
                <Link to="/admin" onClick={() => setMenuOpen(false)} role="menuitem">Events</Link>
                <Link to="/admin/org" onClick={() => setMenuOpen(false)} role="menuitem">Account</Link>
                <button type="button" role="menuitem" onClick={handleSignOut}>Sign out</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="admin-container">
        <div className="admin-welcome muted">{welcome}</div>
        {breadcrumbText ? <div className="admin-breadcrumb muted">{breadcrumbText}</div> : null}
        {children}
      </div>
    </main>
  )
}
