import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { AdminLoginPage } from './pages/AdminLoginPage'
import { AdminOrgPage } from './pages/AdminOrgPage'
import { AdminEventPage } from './pages/AdminEventPage'
import { VotePage } from './pages/VotePage'
import { DisplayPage } from './pages/DisplayPage'

const ContactPage = lazy(() => import('./pages/ContactPage').then((module) => ({ default: module.ContactPage })))
const PrivacyPage = lazy(() => import('./pages/PrivacyPage').then((module) => ({ default: module.PrivacyPage })))
const TermsPage = lazy(() => import('./pages/TermsPage').then((module) => ({ default: module.TermsPage })))
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage').then((module) => ({ default: module.ForgotPasswordPage })))
const UpdatePasswordPage = lazy(() => import('./pages/UpdatePasswordPage').then((module) => ({ default: module.UpdatePasswordPage })))
const AdminSuperPage = lazy(() => import('./pages/AdminSuperPage').then((module) => ({ default: module.AdminSuperPage })))
const AdminSuperOrgPage = lazy(() => import('./pages/AdminSuperOrgPage').then((module) => ({ default: module.AdminSuperOrgPage })))
const AdminBallotPage = lazy(() => import('./pages/AdminBallotPage').then((module) => ({ default: module.AdminBallotPage })))
const DemoLandingPage = lazy(() => import('./demo/DemoLandingPage').then((module) => ({ default: module.DemoLandingPage })))
const DemoVotePage = lazy(() => import('./demo/DemoVotePage').then((module) => ({ default: module.DemoVotePage })))
const DemoDisplayPage = lazy(() => import('./demo/DemoDisplayPage').then((module) => ({ default: module.DemoDisplayPage })))

function RouteFallback() {
  return (
    <div className="admin-shell">
      <div className="admin-container">
        <section className="ui-card admin-surface admin-empty-note">
          <strong>Loading MinistryVote…</strong>
          <p>Preparing the next screen.</p>
        </section>
      </div>
    </div>
  )
}

export function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/update-password" element={<UpdatePasswordPage />} />
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
    </Suspense>
  )
}
