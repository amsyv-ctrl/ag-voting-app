import { SectionMotion } from './SectionMotion'

const painPoints = [
  'Long delays while votes are counted',
  'Confusion during runoff rounds',
  'Difficulty verifying results later',
  'Frustration for moderators and attendees'
]

export function ProblemSection() {
  return (
    <section className="bg-gray-900 py-24">
      <SectionMotion className="mx-auto w-full max-w-5xl px-6">
        <h2 className="mb-16 text-center text-5xl font-bold md:text-6xl">Voting Shouldn’t Slow Down Your Meeting</h2>
        <div className="glow-hover mx-auto max-w-4xl rounded-2xl border border-gray-700 bg-gray-800/60 p-10 md:p-12">
          <p className="mb-10 text-center text-xl leading-relaxed text-gray-300">
            Most churches and ministry networks still rely on paper ballots, hand counting, or outside vendors to run elections.
            <br className="hidden md:block" />
            That often leads to:
          </p>
          <div className="space-y-6 md:space-y-8">
            {painPoints.map((point) => (
              <div className="pain-point py-2 pl-6" key={point}>
                <p className="text-lg font-medium text-red-300">{point}</p>
              </div>
            ))}
          </div>
          <p className="mt-12 text-center text-2xl font-semibold">Important decisions deserve a better system.</p>
        </div>
        <div className="mt-12 text-center">
          <p className="glow-hover mx-auto inline-block max-w-3xl rounded-xl border border-blue-500/30 bg-gray-800/40 px-10 py-6 text-2xl italic text-blue-400">
            MinistryVote replaces manual processes with a simple, secure voting experience anyone can use from their phone.
          </p>
        </div>
      </SectionMotion>
    </section>
  )
}
