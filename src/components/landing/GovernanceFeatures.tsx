import {
  ShieldCheckIcon,
  ArrowPathIcon,
  ScaleIcon,
  DevicePhoneMobileIcon
} from '@heroicons/react/24/outline'
import { SectionMotion } from './SectionMotion'

const features = [
  {
    title: 'Secret Ballots',
    body: 'Every vote is private and protected while still producing verifiable results.',
    Icon: ShieldCheckIcon
  },
  {
    title: 'Runoff Voting',
    body: 'Support multiple rounds automatically when a candidate doesn’t reach the required majority.',
    Icon: ArrowPathIcon
  },
  {
    title: 'Majority Rules',
    body: 'Simple majority, two-thirds votes, and other governance rules are built in.',
    Icon: ScaleIcon
  },
  {
    title: 'Shared Device Friendly',
    body: 'The system resets automatically so multiple voters can use the same phone or tablet.',
    Icon: DevicePhoneMobileIcon
  }
]

export function GovernanceFeatures() {
  return (
    <section className="bg-gray-900 py-24">
      <div className="mx-auto w-full max-w-6xl px-6 text-center">
        <SectionMotion>
          <h2 className="mb-12 text-5xl font-bold md:text-6xl">Designed for Real Governance Decisions</h2>
          <p className="mx-auto mb-16 max-w-4xl text-xl text-gray-300">
            MinistryVote is built specifically for the kinds of elections churches and ministry networks conduct every year.
          </p>
        </SectionMotion>
        <div className="grid gap-8 md:grid-cols-4">
          {features.map(({ title, body, Icon }, idx) => (
            <SectionMotion key={title} delay={0.07 * (idx + 1)}>
              <article className="glow-hover flex h-full flex-col items-center rounded-xl border border-gray-700 bg-gray-800/50 p-8 text-center transition-all duration-300">
                <Icon className="mb-4 h-12 w-12 text-blue-400" aria-hidden="true" />
                <h3 className="mb-4 text-2xl font-bold">{title}</h3>
                <p>{body}</p>
              </article>
            </SectionMotion>
          ))}
        </div>
      </div>
    </section>
  )
}
