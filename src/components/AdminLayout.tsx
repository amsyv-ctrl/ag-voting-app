import { ReactNode, useMemo } from 'react'
import { AdminHeader } from './AdminHeader'

type AdminLayoutProps = {
  children: ReactNode
  breadcrumb?: string[]
  headerActions?: ReactNode
  onSignOut?: () => Promise<void> | void
}

export function AdminLayout({ children, breadcrumb, headerActions, onSignOut }: AdminLayoutProps) {

  const breadcrumbText = useMemo(() => (breadcrumb && breadcrumb.length ? breadcrumb.join(' > ') : null), [breadcrumb])

  return (
    <main className="admin-shell">
      <AdminHeader breadcrumbText={breadcrumbText} actions={headerActions} onSignOut={onSignOut} />

      <div className="admin-container">
        {children}
      </div>
    </main>
  )
}
