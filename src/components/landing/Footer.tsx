import { Link } from 'react-router-dom'

export function Footer() {
  return (
    <footer className="border-t border-gray-800 bg-black py-12 text-center text-gray-500">
      <p className="text-base font-semibold text-gray-300">MinistryVote</p>
      <p className="mb-3 text-sm text-gray-400">Verifiable voting for ministry governance</p>
      <div className="mb-4 flex justify-center gap-4 text-sm">
        <Link to="/" className="text-gray-400 no-underline transition hover:text-blue-300">Home</Link>
        <Link to="/contact" className="text-gray-400 no-underline transition hover:text-blue-300">Contact</Link>
      </div>
      <p>&copy; 2026 Architect Ministry Solutions. All rights reserved.</p>
    </footer>
  )
}
