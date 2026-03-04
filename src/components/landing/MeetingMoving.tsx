import { SectionMotion } from './SectionMotion'

export function MeetingMoving() {
  return (
    <section className="bg-gray-900 py-24">
      <div className="mx-auto w-full max-w-5xl px-6 text-center">
        <SectionMotion>
          <h2 className="mb-12 text-5xl font-bold md:text-6xl">Keep Your Meeting Moving</h2>
          <p className="mb-12 text-xl leading-relaxed text-gray-300">
            Moderators can see participation in real time and close voting confidently without guessing.
            <br />
            Instead of waiting while votes are counted, results appear instantly.
          </p>
          <p className="mb-10 text-2xl font-semibold">Your meeting stays focused on decisions — not logistics.</p>
        </SectionMotion>
        <SectionMotion>
          <div className="mx-auto grid max-w-4xl gap-12 text-left md:grid-cols-2">
            <ul className="space-y-6 text-lg">
              <li className="flex items-center gap-4"><span className="text-3xl text-blue-400">•</span> Live participation counter</li>
              <li className="flex items-center gap-4"><span className="text-3xl text-blue-400">•</span> Automatic vote counting</li>
            </ul>
            <ul className="space-y-6 text-lg">
              <li className="flex items-center gap-4"><span className="text-3xl text-blue-400">•</span> Safe close confirmations</li>
              <li className="flex items-center gap-4"><span className="text-3xl text-blue-400">•</span> Clear runoff guidance</li>
            </ul>
          </div>
        </SectionMotion>
      </div>
    </section>
  )
}
