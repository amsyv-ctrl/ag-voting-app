import {
  CheckCircleIcon,
  ShieldCheckIcon,
  DocumentTextIcon,
  ArrowDownTrayIcon
} from '@heroicons/react/24/outline'
import { SectionMotion } from './SectionMotion'

const items = [
  {
    title: 'Vote Receipts',
    body: 'Participants receive confirmation that their vote was recorded.',
    Icon: CheckCircleIcon
  },
  {
    title: 'Integrity Seals',
    body: 'Each round generates a tamper-evident verification hash.',
    Icon: ShieldCheckIcon
  },
  {
    title: 'Audit Log',
    body: 'All election actions are recorded for transparency and accountability.',
    Icon: DocumentTextIcon
  },
  {
    title: 'Official Record Export',
    body: 'Download a complete election record for your files.',
    Icon: ArrowDownTrayIcon
  }
]

export function VerifiableResults() {
  return (
    <section className="py-24">
      <div className="mx-auto w-full max-w-6xl px-6 text-center">
        <SectionMotion>
          <h2 className="mb-12 text-5xl font-bold md:text-6xl">Results You Can Trust</h2>
          <p className="mx-auto mb-16 max-w-4xl text-xl leading-relaxed text-gray-300">
            Every vote recorded in the system produces a unique receipt code confirming that the vote was received.
            <br />
            When a voting round closes, the results are sealed with a cryptographic integrity hash and stored with a full audit log.
            <br />
            This creates a permanent, verifiable record of the election.
          </p>
        </SectionMotion>
        <div className="grid gap-10 md:grid-cols-4">
          {items.map(({ title, body, Icon }, idx) => (
            <SectionMotion key={title} delay={0.08 * (idx + 1)}>
              <article className="glow-hover flex h-full flex-col items-center rounded-xl border border-gray-700 p-8 transition-all duration-300">
                <Icon className="mb-4 h-16 w-16 text-blue-400" aria-hidden="true" />
                <h3 className="mb-3 text-2xl font-bold">{title}</h3>
                <p className="text-gray-400">{body}</p>
              </article>
            </SectionMotion>
          ))}
        </div>
      </div>
    </section>
  )
}
