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

function EmptyState({
  title,
  copy
}: {
  title: string
  copy: string
}) {
  return (
    <div className="admin-empty-note">
      <strong>{title}</strong>
      <p>{copy}</p>
    </div>
  )
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
        <section className="ui-card admin-surface">
          <EmptyState
            title="Loading organization"
            copy="Pulling subscription state, usage, and recent activity for this workspace."
          />
        </section>
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

      {error && <section className="ui-card admin-surface"><p className="error">{error}</p></section>}
      {notice && <section className="ui-card admin-surface"><p className="winner">{notice}</p></section>}

      {data && (
        <>
          <section className="ui-card admin-surface admin-dark-card">
            <div className="admin-surface-header">
              <div>
                <p className="admin-surface-kicker">Organization Snapshot</p>
                <h3>{data.org.name}</h3>
                <p className="muted">Subscription state, billing identifiers, and support context for this customer workspace.</p>
              </div>
            </div>
            <div className="admin-stat-grid">
              <div className="admin-stat-card super-stat-card"><span>Mode</span><strong>{data.org.mode}</strong></div>
              <div className="admin-stat-card super-stat-card"><span>Active</span><strong>{data.org.is_active ? 'Yes' : 'No'}</strong></div>
              <div className="admin-stat-card super-stat-card"><span>Subscription status</span><strong>{data.org.subscription_status ?? 'N/A'}</strong></div>
              <div className="admin-stat-card super-stat-card"><span>Total events</span><strong>{data.stats.total_events}</strong></div>
              <div className="admin-stat-card super-stat-card"><span>Total ballots</span><strong>{data.stats.total_ballots}</strong></div>
              <div className="admin-stat-card super-stat-card"><span>Total votes cast</span><strong>{data.stats.total_votes_cast}</strong></div>
            </div>
          </section>

          <section className="admin-page-grid admin-page-grid-two">
            <section className="ui-card admin-surface">
              <div className="admin-surface-header">
                <div>
                  <p className="admin-surface-kicker">Organization Details</p>
                  <h3>Customer billing and profile context</h3>
                </div>
              </div>
              <div className="admin-kv-grid">
                <div className="admin-kv">
                  <span className="admin-kv-label">Current period end</span>
                  <span className="admin-kv-value">{formatDate(data.org.current_period_end)}</span>
                </div>
                <div className="admin-kv">
                  <span className="admin-kv-label">Stripe customer ID</span>
                  <span className="admin-kv-value">{data.org.stripe_customer_id || 'N/A'}</span>
                </div>
                <div className="admin-kv">
                  <span className="admin-kv-label">Stripe subscription ID</span>
                  <span className="admin-kv-value">{data.org.stripe_subscription_id || 'N/A'}</span>
                </div>
                <div className="admin-kv">
                  <span className="admin-kv-label">Organization type</span>
                  <span className="admin-kv-value">{data.org.organization_type || 'N/A'}</span>
                </div>
                <div className="admin-kv">
                  <span className="admin-kv-label">Estimated voting size</span>
                  <span className="admin-kv-value">{data.org.estimated_voting_size || 'N/A'}</span>
                </div>
                <div className="admin-kv">
                  <span className="admin-kv-label">Plan</span>
                  <span className="admin-kv-value">{data.stats.plan_name}</span>
                </div>
                <div className="admin-kv">
                  <span className="admin-kv-label">Votes used</span>
                  <span className="admin-kv-value">{data.stats.votes_used} / {data.stats.allowance}</span>
                </div>
                <div className="admin-kv">
                  <span className="admin-kv-label">Overage</span>
                  <span className="admin-kv-value">{data.stats.overage_votes} (${(data.stats.estimated_overage_cents / 100).toFixed(2)})</span>
                </div>
              </div>
            </section>

            <section className="ui-card admin-surface">
              <div className="admin-surface-header">
                <div>
                  <p className="admin-surface-kicker">Super Admin Override</p>
                  <h3>Adjust access, billing period, and internal notes</h3>
                </div>
              </div>
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

          <section className="admin-page-grid admin-page-grid-two">
            <section className="ui-card admin-surface">
              <div className="admin-surface-header">
                <div>
                  <p className="admin-surface-kicker">Recent Activity</p>
                  <h3>Latest actions touching this organization</h3>
                </div>
              </div>
              <div className="super-table-wrap">
                <table>
                  <thead>
                    <tr><th>Action</th><th>Created</th><th>Event</th><th>Ballot</th></tr>
                  </thead>
                  <tbody>
                    {data.recent_activity.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="super-table-empty">
                          <EmptyState
                            title="No recent activity"
                            copy="Audit activity for this organization will appear here once operators begin using the platform."
                          />
                        </td>
                      </tr>
                    ) : (
                      data.recent_activity.map((row, index) => (
                        <tr key={`${row.action}-${row.created_at}-${index}`}>
                          <td data-label="Action">{row.action}</td>
                          <td data-label="Created">{formatDate(row.created_at)}</td>
                          <td data-label="Event">{row.event_id || '—'}</td>
                          <td data-label="Ballot">{row.ballot_id || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="ui-card admin-surface">
              <div className="admin-surface-header">
                <div>
                  <p className="admin-surface-kicker">Upcoming Events</p>
                  <h3>Scheduled meetings for this organization</h3>
                </div>
              </div>
              <div className="super-table-wrap">
                <table>
                  <thead>
                    <tr><th>Event</th><th>Date</th><th>Location</th></tr>
                  </thead>
                  <tbody>
                    {data.upcoming_events.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="super-table-empty">
                          <EmptyState
                            title="No upcoming events"
                            copy="Scheduled events for this organization will appear here once dates are added."
                          />
                        </td>
                      </tr>
                    ) : (
                      data.upcoming_events.map((row) => (
                        <tr key={row.id}>
                          <td data-label="Event">{row.name}</td>
                          <td data-label="Date">{formatDate(row.date)}</td>
                          <td data-label="Location">{row.location || 'N/A'}</td>
                        </tr>
                      ))
                    )}
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
