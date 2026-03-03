import { Link } from 'react-router-dom'

export function DemoBanner() {
  return (
    <div className="demo-banner">
      <strong>DEMO MODE</strong> — votes are simulated and not recorded.
      <div className="demo-banner-links">
        <Link to="/demo">Overview</Link>
        <Link to="/demo/vote">Vote Screen</Link>
        <Link to="/demo/display">Display Screen</Link>
      </div>
    </div>
  )
}

