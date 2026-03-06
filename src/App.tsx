import { Navigate, Route, Routes } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { ContactPage } from './pages/ContactPage'
import { AdminLoginPage } from './pages/AdminLoginPage'
import { AdminOrgPage } from './pages/AdminOrgPage'
import { AdminSuperPage } from './pages/AdminSuperPage'
import { AdminSuperOrgPage } from './pages/AdminSuperOrgPage'
import { AdminEventPage } from './pages/AdminEventPage'
import { AdminBallotPage } from './pages/AdminBallotPage'
import { VotePage } from './pages/VotePage'
import { DisplayPage } from './pages/DisplayPage'
import { DemoLandingPage } from './demo/DemoLandingPage'
import { DemoVotePage } from './demo/DemoVotePage'
import { DemoDisplayPage } from './demo/DemoDisplayPage'

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/admin" element={<AdminLoginPage />} />
      <Route path="/admin/org" element={<AdminOrgPage />} />
      <Route path="/admin/super" element={<AdminSuperPage />} />
      <Route path="/admin/super/org/:orgId" element={<AdminSuperOrgPage />} />
      <Route path="/admin/events/:id" element={<AdminEventPage />} />
      <Route path="/admin/ballots/:id" element={<AdminBallotPage />} />
      <Route path="/vote/:slug" element={<VotePage />} />
      <Route path="/display/:slug" element={<DisplayPage />} />
      <Route path="/demo" element={<DemoLandingPage />} />
      <Route path="/demo/vote" element={<DemoVotePage />} />
      <Route path="/demo/display" element={<DemoDisplayPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
