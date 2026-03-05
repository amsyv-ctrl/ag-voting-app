import { Link } from 'react-router-dom'
import { SectionMotion } from './SectionMotion'

export function FinalCTA() {
  return (
    <section className="bg-gradient-to-b from-gray-900 to-black py-32 text-center">
      <SectionMotion className="mx-auto w-full max-w-5xl px-6">
        <h2 className="mb-10 text-5xl font-extrabold md:text-7xl">Run Your Next Election With Confidence</h2>
        <p className="mb-16 text-2xl leading-relaxed text-gray-300">
          Whether you’re voting in a board meeting or a district conference, MinistryVote makes the process simple, transparent, and verifiable.
          <br />
          Start your free trial today and see how smooth governance voting can be.
        </p>
        <Link to="/admin?mode=register" className="glow-hover inline-block rounded-2xl bg-blue-600 px-16 py-8 text-3xl font-bold text-white no-underline transition hover:bg-blue-700">
          Create Your First Event
        </Link>
      </SectionMotion>
    </section>
  )
}
