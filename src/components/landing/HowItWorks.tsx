import { SectionMotion } from './SectionMotion'

const steps = [
  {
    number: '1',
    title: 'Create Your Event',
    body: 'Set up an event and add ballots in seconds. Configure majority rules, candidates, and voting rounds.'
  },
  {
    number: '2',
    title: 'Attendees Vote From Their Phones',
    body: 'Participants scan a QR code and vote instantly. Shared devices work smoothly with automatic screen reset.'
  },
  {
    number: '3',
    title: 'See Results Instantly',
    body: 'Moderators see participation and results in real time. Close the vote and export the official record.'
  }
]

export function HowItWorks() {
  return (
    <section id="how" className="py-24">
      <div className="mx-auto w-full max-w-6xl px-6">
        <SectionMotion>
          <h2 className="mb-16 text-center text-5xl font-bold md:text-6xl">Run an Election in Minutes</h2>
        </SectionMotion>
        <div className="grid gap-8 md:grid-cols-3 md:gap-12">
          {steps.map((step, idx) => (
            <SectionMotion key={step.number} delay={0.08 * (idx + 1)}>
              <div className="glow-hover rounded-2xl border border-gray-700 bg-gray-800/50 p-10 transition-all duration-300">
                <div className="mb-6 text-6xl font-extrabold text-blue-400">{step.number}</div>
                <h3 className="mb-4 text-2xl font-bold">{step.title}</h3>
                <p className="text-lg text-gray-300">{step.body}</p>
              </div>
            </SectionMotion>
          ))}
        </div>
      </div>
    </section>
  )
}
