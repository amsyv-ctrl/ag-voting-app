import { Link } from 'react-router-dom'
import { SectionMotion } from './SectionMotion'

export function Pricing() {
  return (
    <section id="pricing" className="py-24">
      <div className="mx-auto w-full max-w-6xl px-6 text-center">
        <SectionMotion>
          <h2 className="mb-16 text-5xl font-bold md:text-6xl">Simple Pricing for Churches and Networks</h2>
        </SectionMotion>
        <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-3">
          <SectionMotion>
            <div className="glow-hover rounded-2xl border border-gray-700 bg-gray-800/50 p-10 transition-all duration-300">
              <h3 className="mb-4 text-4xl font-bold">Starter</h3>
              <p className="text-2xl">Up to 500 votes per year</p>
            </div>
          </SectionMotion>
          <SectionMotion delay={0.06}>
            <div className="glow-hover relative scale-105 rounded-2xl border-2 border-blue-500 bg-blue-900/40 p-10 transition-all duration-300">
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-8 py-2 text-sm font-bold">Recommended</div>
              <h3 className="mb-4 text-4xl font-bold">Growth</h3>
              <p className="text-2xl">Up to 2000 votes per year</p>
            </div>
          </SectionMotion>
          <SectionMotion delay={0.12}>
            <div className="glow-hover rounded-2xl border border-gray-700 bg-gray-800/50 p-10 transition-all duration-300">
              <h3 className="mb-4 text-4xl font-bold">Network</h3>
              <p className="text-2xl">Up to 5000 votes per year</p>
            </div>
          </SectionMotion>
        </div>
        <p className="mb-10 mt-12 text-xl">Overages are billed at $0.50 per vote.</p>
        <Link to="/signup" className="glow-hover inline-block rounded-xl bg-blue-600 px-12 py-6 text-2xl font-bold transition hover:bg-blue-700">Start Your Free Trial</Link>
      </div>
    </section>
  )
}
