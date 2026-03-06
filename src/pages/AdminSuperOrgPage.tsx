import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AdminLayout } from '../components/AdminLayout'
import { PageHero } from '../components/PageHero'
import { getAccessToken, requireSession } from '../lib/auth'
import { getSuperAdminOrgDetail, superAdminUpdateOrg, type SuperAdminOrgDetailResponse } from '../lib/api'
import { supabase } from '../lib/supabase'

const SUPER_ADMIN_EMAIL = 'yvincent90@gmail.com'

function formatDate(value: string | null) {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export function AdminSuperOrgPage() {
  const navigate = useNavigate()
  const { orgId } = useParams()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [data, setData] = useState<SuperAdminOrgDetailResponse | null>(null)
  const [overrideMode, setOverrideMode] = useState<'TRIAL' | 'PAID' | 'INACTIVE'>('TRIAL')
  const [isActive, setIsActive] = useState(true)
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState('')
  const [trialVotesLimit, setTrialVotesLimit] = useState('100')
  const [internalNotes, setInternalNotes] = useState('')

  async function load() {
    setLoading(true)
    setError(null)
    const session = await requireSession()
    if (!session) {
      navigate('/admin')
      return
    }
    if ((session.user.email ?? '').toLowerCase() !== SUPER_ADMIN_EMAIL) {
      navigate('/admin/org')
      return
    }

    const token = await getAccessToken()
    if (!token || !orgId) {
      navigate('/admin')
      return
    }

    try {
      const detail = await getSuperAdminOrgDetail(token, orgId)
      setData(detail)
      setOverrideMode(detail.org.is_active ? (detail.org.mode === 'TRIAL' ? 'TRIAL' : 'PAID') : 'INACTIVE')
      setIsActive(detail.org.is_active)
      setCurrentPeriodEnd(detail.org.current_period_end ? detail.org.current_period_end.slice(0, 16) : '')
      setTrialVotesLimit(String(detail.org.trial_votes_limit ?? 100))
      setInternalNotes(detail.org.internal_notes ?? '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load organization detail')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [orgId])

  async function onSignOut() {
    await supabase.auth.signOut()
    navigate('/admin')
  }

  async function onSaveOverride() {
    if (!orgId) return
    const token = await getAccessToken()
    if (!token) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      await superAdminUpdateOrg(token, {
        orgId,
        mode: overrideMode,
        is_active: overrideMode === 'INACTIVE' ? false : isActive,
        current_period_end: currentPeriodEnd ? new Date(currentPeriodEnd).toISOString() : null,
        trial_votes_limit: Number.parseInt(trialVotesLimit, 10) || null,
        internal_notes: internalNotes || null
      })
      setNotice('Super admin override saved.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save override')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <AdminLayout onSignOut={onSignOut}>
        <section className="ui-card"><p>Loading organization...</p></section>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout breadcrumb={['Super Admin', data?.org.name ?? 'Organization']} onSignOut={onSignOut}>
      <PageHero
        title={data?.org.name ?? 'Organization'}
        subtitle="Super admin organization detail and support controls."
        rightActions={
          <Link to="/admin/super">
            <button className="btn btn-secondary" type="button">Back to dashboard</button>
          </Link>
        }
      />

      {error && <section className="ui-card"><p className="error">{error}</p></section>}
      {notice && <section className="ui-card"><p className="winner">{notice}</p></section>}

      {data && (
        <>
          <section className="super-summary-grid">
            <div className="ui-card super-stat-card"><span>Mode</span><strong>{data.org.mode}</strong></div>
            <div className="ui-card super-stat-card"><span>Active</span><strong>{data.org.is_active ? 'Yes' : 'No'}</strong></div>
            <div className="ui-card super-stat-card"><span>Subscription status</span><strong>{data.org.subscription_status ?? 'N/A'}</strong></div>
            <div className="ui-card super-stat-card"><span>Total events</span><strong>{data.stats.total_events}</strong></div>
            <div className="ui-card super-stat-card"><span>Total ballots</span><strong>{data.stats.total_ballots}</strong></div>
            <div className="ui-card super-stat-card"><span>Total votes cast</span><strong>{data.stats.total_votes_cast}</strong></div>
          </section>

          <section className="ui-grid-2">
            <section className="ui-card">
              <h3>Organization details</h3>
              <p><strong>Current period end:</strong> {formatDate(data.org.current_period_end)}</p>
              <p><strong>Stripe customer ID:</strong> {data.org.stripe_customer_id || 'N/A'}</p>
              <p><strong>Stripe subscription ID:</strong> {data.org.stripe_subscription_id || 'N/A'}</p>
              <p><strong>Organization type:</strong> {data.org.organization_type || 'N/A'}</p>
              <p><strong>Estimated voting size:</strong> {data.org.estimated_voting_size || 'N/A'}</p>
              <p><strong>Plan:</strong> {data.stats.plan_name}</p>
              <p><strong>Votes used:</strong> {data.stats.votes_used} / {data.stats.allowance}</p>
              <p><strong>Overage:</strong> {data.stats.overage_votes} (${(data.stats.estimated_overage_cents / 100).toFixed(2)})</p>
            </section>

            <section className="ui-card">
              <h3>Super Admin Override</h3>
              <div className="form-grid">
                <label className="form-row">
                  Mode
                  <select className="select" value={overrideMode} onChange={(e) => setOverrideMode(e.target.value as 'TRIAL' | 'PAID' | 'INACTIVE')}>
                    <option value="TRIAL">TRIAL</option>
                    <option value="PAID">PAID</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </label>
                <label className="form-row">
                  Active
                  <select className="select" value={isActive ? 'true' : 'false'} onChange={(e) => setIsActive(e.target.value === 'true')} disabled={overrideMode === 'INACTIVE'}>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </label>
                <label className="form-row">
                  Current period end
                  <input className="input" type="datetime-local" value={currentPeriodEnd} onChange={(e) => setCurrentPeriodEnd(e.target.value)} />
                </label>
                <label className="form-row">
                  Trial vote allowance
                  <input className="input" type="number" min={1} value={trialVotesLimit} onChange={(e) => setTrialVotesLimit(e.target.value)} />
                </label>
                <label className="form-row form-row-full">
                  Internal notes
                  <textarea className="textarea" value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} />
                </label>
                <div className="form-actions form-row-full">
                  <button className="btn btn-primary" type="button" onClick={onSaveOverride} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Override'}
                  </button>
                </div>
              </div>
            </section>
          </section>

          <section className="ui-grid-2">
            <section className="ui-card">
              <h3>Recent activity</h3>
              <div className="super-table-wrap">
                <table>
                  <thead>
                    <tr><th>Action</th><th>Created</th><th>Event</th><th>Ballot</th></tr>
                  </thead>
                  <tbody>
                    {data.recent_activity.map((row, index) => (
                      <tr key={`${row.action}-${row.created_at}-${index}`}>
                        <td>{row.action}</td>
                        <td>{formatDate(row.created_at)}</td>
                        <td>{row.event_id || '—'}</td>
                        <td>{row.ballot_id || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="ui-card">
              <h3>Upcoming events</h3>
              <div className="super-table-wrap">
                <table>
                  <thead>
                    <tr><th>Event</th><th>Date</th><th>Location</th></tr>
                  </thead>
                  <tbody>
                    {data.upcoming_events.map((row) => (
                      <tr key={row.id}>
                        <td>{row.name}</td>
                        <td>{formatDate(row.date)}</td>
                        <td>{row.location || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </section>
        </>
      )}
    </AdminLayout>
  )
}
