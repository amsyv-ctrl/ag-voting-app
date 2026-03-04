import { Link } from 'react-router-dom'
import { SectionMotion } from './SectionMotion'

export function Pricing() {
  return (
    <section id="pricing" className="py-24">
      <div className="mx-auto w-full max-w-6xl px-6 text-center">
        <SectionMotion>
          <h2 className="mb-6 text-5xl font-bold md:text-6xl">Simple Pricing for Churches and Ministry Networks</h2>
          <p className="mx-auto mb-4 max-w-3xl text-xl text-gray-300">
            Choose a plan based on the number of votes your organization runs each year.
          </p>
          <p className="mb-16 text-lg text-blue-300">
            Built for church governance — not generic polling.
          </p>
        </SectionMotion>
        <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-3">
          <SectionMotion>
            <div className="glow-hover flex h-full flex-col rounded-2xl border border-gray-700 bg-gray-800/50 p-8 text-left transition-all duration-300">
              <h3 className="mb-2 text-4xl font-bold">Starter</h3>
              <p className="mb-5 text-sm text-gray-300">Best for churches and smaller organizations</p>
              <p className="mb-2 text-3xl font-bold text-white">$500 / year</p>
              <p className="mb-6 text-lg text-blue-300">Up to 500 votes per year</p>
              <ul className="mb-8 space-y-3 text-gray-200">
                <li>• Unlimited events</li>
                <li>• Secret ballots</li>
                <li>• Runoff voting</li>
                <li>• Vote receipts</li>
                <li>• Integrity-sealed results</li>
                <li>• Official record export</li>
              </ul>
              <Link to="/admin?mode=register" className="glow-hover mt-auto inline-block rounded-xl bg-blue-600 px-6 py-3 text-center font-bold text-white no-underline transition hover:bg-blue-700">
                Start Free Trial
              </Link>
            </div>
          </SectionMotion>
          <SectionMotion delay={0.06}>
            <div className="glow-hover relative flex h-full scale-105 flex-col rounded-2xl border-2 border-blue-500 bg-blue-900/40 p-8 text-left transition-all duration-300">
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-8 py-2 text-sm font-bold">Most Popular</div>
              <h3 className="mb-2 text-4xl font-bold">Growth</h3>
              <p className="mb-5 text-sm text-gray-200">Ideal for larger churches and regional ministries</p>
              <p className="mb-2 text-3xl font-bold text-white">$1,500 / year</p>
              <p className="mb-6 text-lg text-blue-200">Up to 2,000 votes per year</p>
              <ul className="mb-8 space-y-3 text-gray-100">
                <li>• Everything in Starter</li>
                <li>• Higher capacity for multiple meetings</li>
                <li>• Great for annual business meetings and board elections</li>
              </ul>
              <Link to="/admin?mode=register" className="glow-hover mt-auto inline-block rounded-xl bg-blue-600 px-6 py-3 text-center font-bold text-white no-underline transition hover:bg-blue-700">
                Start Free Trial
              </Link>
            </div>
          </SectionMotion>
          <SectionMotion delay={0.12}>
            <div className="glow-hover flex h-full flex-col rounded-2xl border border-gray-700 bg-gray-800/50 p-8 text-left transition-all duration-300">
              <h3 className="mb-2 text-4xl font-bold">Network</h3>
              <p className="mb-5 text-sm text-gray-300">Designed for district or network conferences</p>
              <p className="mb-2 text-3xl font-bold text-white">$3,000 / year</p>
              <p className="mb-6 text-lg text-blue-300">Up to 5,000 votes per year</p>
              <ul className="mb-8 space-y-3 text-gray-200">
                <li>• Everything in Growth</li>
                <li>• Capacity for large conferences</li>
                <li>• Multiple runoff rounds</li>
                <li>• Network-scale governance voting</li>
              </ul>
              <Link to="/admin?mode=register" className="glow-hover mt-auto inline-block rounded-xl bg-blue-600 px-6 py-3 text-center font-bold text-white no-underline transition hover:bg-blue-700">
                Start Free Trial
              </Link>
            </div>
          </SectionMotion>
        </div>
        <SectionMotion className="mx-auto mt-12 max-w-3xl">
          <div className="rounded-xl border border-blue-500/30 bg-gray-900/70 px-6 py-6 text-left">
            <h3 className="mb-2 text-2xl font-bold text-blue-300">Overage</h3>
            <p className="mb-2 text-gray-200">If you exceed your plan limit, additional votes are billed automatically.</p>
            <p className="mb-2 text-xl font-bold text-white">$0.50 per vote</p>
            <p className="text-gray-300">Voting never stops mid-meeting. If you exceed your plan limit, additional votes are billed automatically.</p>
          </div>
        </SectionMotion>
      </div>
    </section>
  )
}
