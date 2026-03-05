import { Link } from 'react-router-dom'
import { SectionMotion } from './SectionMotion'

type HeroProps = {
  onOpenLogin: () => void
}

export function Hero({ onOpenLogin }: HeroProps) {
  const trustBadges = [
    {
      title: 'Secret Ballots',
      text: 'Voter privacy is protected while keeping the process accountable.'
    },
    {
      title: 'Vote Receipts',
      text: 'Each vote returns a receipt code confirming it was recorded.'
    },
    {
      title: 'Integrity-Sealed Results',
      text: 'Each round produces a tamper-evident seal and an official record export.'
    }
  ]

  return (
    <>
      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-gray-800 bg-gray-950/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4">
          <a href="#top" className="no-underline">
            <div className="flex flex-col">
              <span className="text-2xl font-bold text-blue-400 transition hover:text-blue-300">MinistryVote</span>
              <span className="hidden text-xs text-gray-400 sm:block">Verifiable voting for ministry governance</span>
            </div>
          </a>
          <div className="flex items-center gap-4 sm:gap-8">
            <a href="#how" className="hidden transition hover:text-blue-400 sm:inline">How It Works</a>
            <a href="#pricing" className="hidden transition hover:text-blue-400 sm:inline">Pricing</a>
            <button
              onClick={onOpenLogin}
              className="glow-hover rounded-lg bg-blue-600 px-6 py-2 font-medium transition hover:bg-blue-700"
              type="button"
            >
              Login
            </button>
          </div>
        </div>
      </nav>

      <section className="landing-hero-overlay relative flex min-h-screen items-center justify-center pt-20">
        <SectionMotion className="relative mx-auto w-full max-w-5xl px-6 text-center">
          <div className="rounded-2xl border border-gray-700/50 bg-black/25 p-10 backdrop-blur-sm md:p-12">
          <h1 className="text-glow mb-6 text-5xl font-extrabold leading-tight md:text-7xl">
            Run Church Elections<br />With Confidence
          </h1>
          <p className="text-glow mx-auto mb-6 max-w-3xl text-2xl font-medium tracking-wide text-gray-200 md:text-3xl">
            A verifiable governance voting system designed for churches and ministry networks.
          </p>
          <p className="text-glow mb-8 text-xl font-semibold text-gray-100 md:text-2xl">
            Secure ballots, automatic runoff rounds, and sealed results — all from any phone.
          </p>
          <p className="text-glow mx-auto mb-12 max-w-4xl text-lg leading-relaxed text-gray-300 md:text-xl">
            Replace paper ballots and manual counting with a simple system that keeps meetings moving.
          </p>
          <div className="mb-12 flex flex-col justify-center gap-6 sm:flex-row">
            <Link to="/admin?mode=register" className="glow-hover rounded-xl bg-blue-600 px-10 py-5 text-xl font-bold text-white no-underline transition hover:bg-blue-700">
              Start a Free Trial
            </Link>
            <a href="#how" className="glow-hover rounded-xl border border-blue-500 px-10 py-5 text-xl font-bold text-blue-300 no-underline transition hover:bg-blue-900/30">
              See How It Works
            </a>
          </div>
          <button
            type="button"
            onClick={onOpenLogin}
            className="glow-hover mb-16 rounded-xl border border-blue-500 px-10 py-5 text-xl font-bold text-white transition hover:bg-blue-900/30"
          >
            Already have an account? Login
          </button>

          <div className="mb-10 grid gap-3 text-left sm:grid-cols-2 lg:grid-cols-3">
            {trustBadges.map((badge) => (
              <article key={badge.title} className="glow-hover rounded-xl border border-blue-500/30 bg-gray-900/55 p-4">
                <h3 className="mb-1 text-base font-bold text-blue-300">{badge.title}</h3>
                <p className="text-sm text-gray-300">{badge.text}</p>
              </article>
            ))}
          </div>

          <div className="mx-auto mb-6 flex w-fit items-center gap-3 rounded-full border border-gray-700 bg-gray-900/60 px-6 py-3 shadow-lg backdrop-blur-md">
            <div className="h-4 w-4 animate-pulse-slow rounded-full bg-green-500 ring-2 ring-green-400/50" />
            <span className="text-sm font-medium">Powered by <span className="font-semibold text-white">Architect Ministry Solutions</span></span>
          </div>
          </div>
        </SectionMotion>
      </section>
    </>
  )
}
