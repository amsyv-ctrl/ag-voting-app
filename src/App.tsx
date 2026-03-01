import { Navigate, Route, Routes } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { AdminLoginPage } from './pages/AdminLoginPage'
import { AdminEventPage } from './pages/AdminEventPage'
import { AdminBallotPage } from './pages/AdminBallotPage'
import { VotePage } from './pages/VotePage'
import { DisplayPage } from './pages/DisplayPage'

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/admin" element={<AdminLoginPage />} />
      <Route path="/admin/events/:id" element={<AdminEventPage />} />
      <Route path="/admin/ballots/:id" element={<AdminBallotPage />} />
      <Route path="/vote/:slug" element={<VotePage />} />
      <Route path="/display/:slug" element={<DisplayPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
