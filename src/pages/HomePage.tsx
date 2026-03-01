import { motion } from 'framer-motion'
import Particles from 'react-tsparticles'
import { loadFull } from 'tsparticles'
import { Link as RouterLink } from 'react-router-dom'
import { Link as ScrollLink } from 'react-scroll'

const particlesInit = async (main: any) => {
  await loadFull(main)
}

const particlesOptions = {
  particles: {
    number: { value: 50 },
    color: { value: '#ffffff' },
    shape: { type: 'circle' },
    opacity: { value: 0.5 },
    size: { value: 1 },
    move: { enable: true, speed: 0.5, direction: 'none' as const, random: true }
  },
  interactivity: {
    events: { onHover: { enable: true, mode: 'repulse' as const } }
  },
  background: { color: '#000000' }
}

export function HomePage() {
  return (
    <div className="min-h-screen bg-black text-white font-body">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(37,99,235,0.25),transparent_40%),radial-gradient(circle_at_80%_10%,rgba(56,189,248,0.2),transparent_35%),linear-gradient(180deg,#000000,#030712)]" />
      <Particles id="tsparticles" init={particlesInit} options={particlesOptions} className="absolute inset-0" />

      <motion.section
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1 }}
        className="relative flex h-screen flex-col items-center justify-center px-4 text-center"
      >
        <h1 className="font-display mb-4 text-5xl font-bold tracking-wide md:text-8xl">AG Voting Revolution</h1>
        <p className="mb-8 max-w-2xl text-xl md:text-2xl">
          Transforming Assemblies of God meetings from routine to revolutionary. Vote securely, see results
          instantly.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <RouterLink
            to="/admin"
            className="rounded-full bg-blue-600 px-6 py-3 text-lg font-semibold text-white transition duration-300 hover:bg-blue-800"
          >
            Log In as Admin
          </RouterLink>
          <RouterLink
            to="/admin?mode=register"
            className="rounded-full bg-emerald-600 px-6 py-3 text-lg font-semibold text-white transition duration-300 hover:bg-emerald-700"
          >
            Register New Admin
          </RouterLink>
          <ScrollLink
            to="how"
            smooth={true}
            duration={500}
            className="cursor-pointer rounded-full border border-white/40 px-6 py-3 text-lg font-semibold text-white transition duration-300 hover:bg-white/10"
          >
            How It Works
          </ScrollLink>
        </div>
      </motion.section>

      <motion.section
        id="what"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        className="bg-gradient-to-b from-black to-gray-900 px-4 py-16"
      >
        <h2 className="mb-12 text-center font-display text-4xl font-bold">What We Do</h2>
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 md:grid-cols-3">
          <div className="rounded-lg bg-gray-800 p-6 shadow-lg transition duration-300 hover:scale-105">
            <h3 className="mb-4 text-2xl font-semibold">Secure Voting for AG Business</h3>
            <p>Create ballots for conferences, meetings, and events. PIN-protected for integrity.</p>
          </div>
          <div className="rounded-lg bg-gray-800 p-6 shadow-lg transition duration-300 hover:scale-105">
            <h3 className="mb-4 text-2xl font-semibold">Real-Time Results</h3>
            <p>Instant tallies and displays, projector-ready for dynamic sessions.</p>
          </div>
          <div className="rounded-lg bg-gray-800 p-6 shadow-lg transition duration-300 hover:scale-105">
            <h3 className="mb-4 text-2xl font-semibold">Easy Access</h3>
            <p>QR codes for quick joins, no apps needed. Just scan and vote.</p>
          </div>
        </div>
      </motion.section>

      <motion.section
        id="how"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        className="bg-black px-4 py-16"
      >
        <h2 className="mb-12 text-center font-display text-4xl font-bold">How to Get Started</h2>
        <div className="mx-auto flex max-w-4xl flex-col items-start space-y-10">
          <div className="flex items-center gap-4">
            <span className="text-3xl font-bold text-blue-500">1</span>
            <p className="text-xl">Create a vote: log in as admin and set up your ballot in minutes.</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-3xl font-bold text-blue-500">2</span>
            <p className="text-xl">Scan the QR: share the code at your AG meeting so participants join instantly.</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-3xl font-bold text-blue-500">3</span>
            <p className="text-xl">Vote securely: enter PIN (if required), cast a vote in one tap.</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-3xl font-bold text-blue-500">4</span>
            <p className="text-xl">Instant results: watch updates and export records.</p>
          </div>
        </div>
        <div className="mt-12 text-center">
          <RouterLink
            to="/admin"
            className="rounded-full bg-blue-600 px-6 py-3 text-lg font-semibold text-white transition duration-300 hover:bg-blue-800"
          >
            Create Your First Vote
          </RouterLink>
        </div>
      </motion.section>

      <footer className="bg-gray-900 py-8 text-center">
        <p>&copy; 2026 AG Voting App. Powered by innovation.</p>
      </footer>
    </div>
  )
}
