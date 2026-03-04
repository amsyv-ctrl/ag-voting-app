import { SectionMotion } from './SectionMotion'

export function TimeSavings() {
  return (
    <section className="bg-gray-900 py-24">
      <div className="mx-auto w-full max-w-5xl px-6 text-center">
        <SectionMotion>
          <h2 className="mb-12 text-5xl font-bold md:text-6xl">Turn a 30-Minute Voting Process Into 2 Minutes</h2>
        </SectionMotion>
        <div className="grid gap-12 md:grid-cols-2">
          <SectionMotion>
            <div className="glow-hover h-full min-h-[340px] rounded-2xl border border-gray-700 bg-gray-800/50 p-10">
              <h3 className="mb-8 text-4xl font-bold text-red-400">Traditional Voting</h3>
              <ul className="space-y-5 text-left text-lg">
                <li>• Print ballots</li>
                <li>• Distribute paper</li>
                <li>• Collect ballots</li>
                <li>• Hand count votes</li>
                <li>• Recount if disputed</li>
              </ul>
            </div>
          </SectionMotion>
          <SectionMotion delay={0.1}>
            <div className="glow-hover h-full min-h-[340px] rounded-2xl border border-gray-700 bg-gray-800/50 p-10">
              <h3 className="mb-8 text-4xl font-bold text-green-400">AG Voting</h3>
              <ul className="space-y-5 text-left text-lg">
                <li>• Display QR code</li>
                <li>• Attendees vote instantly</li>
                <li>• Results appear immediately</li>
              </ul>
            </div>
          </SectionMotion>
        </div>
        <SectionMotion>
          <p className="mt-12 text-2xl font-medium">Meetings move faster and leaders stay focused on the mission.</p>
        </SectionMotion>
      </div>
    </section>
  )
}
