import { SectionMotion } from './SectionMotion'

const bullets = [
  'Sealed round results with majority thresholds',
  'Audit trail of election actions (open, close, seal)',
  'Exportable official record for governance files'
]

export function OfficialRecordsSection() {
  return (
    <section className="bg-gray-900 py-20">
      <div className="mx-auto w-full max-w-6xl px-6">
        <SectionMotion className="rounded-2xl border border-blue-500/20 bg-gray-900/60 p-8 text-left backdrop-blur-sm md:p-10">
          <h2 className="mb-4 text-4xl font-bold md:text-5xl">Official Records, Ready for Your Files</h2>
          <p className="mb-6 max-w-4xl text-lg text-gray-300">
            When voting closes, MinistryVote generates an official record for your meeting, including round summaries, audit entries, and an integrity seal you can verify later.
          </p>
          <ul className="grid gap-3 md:grid-cols-3">
            {bullets.map((item) => (
              <li key={item} className="rounded-xl border border-gray-700 bg-gray-800/50 px-4 py-3 text-gray-200">
                {item}
              </li>
            ))}
          </ul>
        </SectionMotion>
      </div>
    </section>
  )
}
