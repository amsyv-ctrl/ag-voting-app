import { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Footer } from './Footer'

type PublicSiteLayoutProps = {
  children: ReactNode
}

export function PublicSiteLayout({ children }: PublicSiteLayoutProps) {
  return (
    <main className="landing-root min-h-screen bg-gray-950 text-gray-100">
      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-gray-800 bg-gray-950/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <Link to="/" className="no-underline">
            <div className="flex flex-col">
              <span className="text-2xl font-bold text-blue-400 transition hover:text-blue-300">MinistryVote</span>
              <span className="hidden text-xs text-gray-400 sm:block">Verifiable voting for ministry governance</span>
            </div>
          </Link>
          <div className="flex items-center gap-4 sm:gap-8">
            <Link to="/" className="hidden text-gray-200 no-underline transition hover:text-blue-400 sm:inline">Home</Link>
            <Link to="/contact" className="hidden text-gray-200 no-underline transition hover:text-blue-400 sm:inline">Contact</Link>
            <Link to="/privacy" className="hidden text-gray-200 no-underline transition hover:text-blue-400 sm:inline">Privacy</Link>
            <Link to="/terms" className="hidden text-gray-200 no-underline transition hover:text-blue-400 sm:inline">Terms</Link>
            <Link to="/admin" className="glow-hover rounded-lg bg-blue-600 px-6 py-2 font-medium text-white no-underline transition hover:bg-blue-700">
              Login
            </Link>
          </div>
        </div>
      </nav>

      <div className="px-6 pb-16 pt-28">
        {children}
      </div>

      <Footer />
    </main>
  )
}
