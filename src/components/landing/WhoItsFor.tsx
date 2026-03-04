import {
  UsersIcon,
  UserGroupIcon,
  BriefcaseIcon,
  CalendarDaysIcon
} from '@heroicons/react/24/outline'
import { SectionMotion } from './SectionMotion'

const cards = [
  {
    title: 'Church Boards',
    body: 'Run elder or board elections without paper ballots.',
    Icon: UsersIcon
  },
  {
    title: 'District and Network Conferences',
    body: 'Conduct credential votes and leadership elections smoothly.',
    Icon: UserGroupIcon
  },
  {
    title: 'Ministry Organizations',
    body: 'Use a transparent system for board decisions and member voting.',
    Icon: BriefcaseIcon
  },
  {
    title: 'Annual Business Meetings',
    body: 'Let attendees vote instantly from their phones.',
    Icon: CalendarDaysIcon
  }
]

export function WhoItsFor() {
  return (
    <section className="py-24">
      <div className="mx-auto w-full max-w-6xl px-6 text-center">
        <SectionMotion>
          <h2 className="mb-16 text-5xl font-bold md:text-6xl">Built for Ministry Leadership</h2>
        </SectionMotion>
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {cards.map(({ title, body, Icon }, idx) => (
            <SectionMotion key={title} delay={0.08 * (idx + 1)}>
              <article className="glow-hover flex h-full flex-col items-center rounded-2xl border border-gray-700 bg-gray-800/50 p-10 text-center transition-all duration-300">
                <Icon className="mb-6 h-14 w-14 text-blue-400" aria-hidden="true" />
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
