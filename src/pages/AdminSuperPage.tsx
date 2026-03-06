import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AdminLayout } from '../components/AdminLayout'
import { PageHero } from '../components/PageHero'
import { getSuperAdminDashboard, type SuperAdminDashboardResponse } from '../lib/api'
import { getAccessToken, requireSession } from '../lib/auth'
import { supabase } from '../lib/supabase'

const SUPER_ADMIN_EMAIL = 'yvincent90@gmail.com'

function formatDate(value: string | null) {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function formatDateOnly(value: string | null) {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString()
}

function DonutChart({
  title,
  data
}: {
  title: string
  data: Record<string, number>
}) {
  const entries = Object.entries(data).filter(([, value]) => value > 0)
  const total = entries.reduce((sum, [, value]) => sum + value, 0)
  const colors = ['#174a96', '#4f8ef7', '#94a3b8', '#10b981', '#f59e0b', '#dc3545']

  const gradient = useMemo(() => {
    if (total <= 0) return 'conic-gradient(#dbe6f5 0deg 360deg)'
    let offset = 0
    const segments = entries.map(([, value], index) => {
      const degrees = (value / total) * 360
      const color = colors[index % colors.length]
      const start = offset
      const end = offset + degrees
      offset = end
      return `${color} ${start}deg ${end}deg`
    })
    return `conic-gradient(${segments.join(', ')})`
  }, [entries, total])

  return (
    <section className="ui-card">
      <h3>{title}</h3>
      <div className="super-chart-row">
        <div className="super-donut-wrap">
          <div className="super-donut-chart" style={{ background: gradient }}>
            <div className="super-donut-hole">
              <strong>{total}</strong>
              <span>Total</span>
            </div>
          </div>
        </div>
        <div className="super-chart-legend">
          {entries.length === 0 ? (
            <p className="muted">No data yet.</p>
          ) : (
            entries.map(([label, value], index) => (
              <div className="super-legend-item" key={label}>
                <span className="super-legend-dot" style={{ background: colors[index % colors.length] }} />
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  )
}

function BarChart({
  title,
  data
}: {
  title: string
  data: Record<string, number>
}) {
  const entries = Object.entries(data)
  const max = Math.max(1, ...entries.map(([, value]) => value))

  return (
    <section className="ui-card">
      <h3>{title}</h3>
      <div className="super-bar-chart">
        {entries.length === 0 ? (
          <p className="muted">No data yet.</p>
        ) : (
          entries.map(([label, value]) => (
            <div className="super-bar-row" key={label}>
              <div className="super-bar-meta">
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
              <div className="super-bar-track">
                <div className="super-bar-fill" style={{ width: `${(value / max) * 100}%` }} />
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

export function AdminSuperPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<SuperAdminDashboardResponse | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    const session = await requireSession()
    if (!session) {
      navigate('/admin')
      return
    }

    const email = (session.user.email ?? '').toLowerCase()
    if (email !== SUPER_ADMIN_EMAIL) {
      navigate('/admin/org')
      return
    }

    const token = await getAccessToken()
    if (!token) {
      navigate('/admin')
      return
    }

    try {
      const dashboard = await getSuperAdminDashboard(token)
      setData(dashboard)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load super admin dashboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function onSignOut() {
    await supabase.auth.signOut()
    navigate('/admin')
  }

  if (loading) {
    return (
      <AdminLayout onSignOut={onSignOut}>
        <section className="ui-card"><p>Loading dashboard...</p></section>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout breadcrumb={['Account', 'Super Admin']} onSignOut={onSignOut}>
      <PageHero
        title="Super Admin Dashboard"
        subtitle="Platform-wide adoption, usage, and subscription overview."
        rightActions={
          <Link to="/admin/org">
            <button className="btn btn-secondary" type="button">Back to account</button>
          </Link>
        }
      />

      {error && (
        <section className="ui-card">
          <p className="error">{error}</p>
        </section>
      )}

      {data && (
        <>
          <section className="super-summary-grid">
            <div className="ui-card super-stat-card"><span>Total organizations</span><strong>{data.summary.total_organizations}</strong></div>
            <div className="ui-card super-stat-card"><span>Paid active organizations</span><strong>{data.summary.paid_active_organizations}</strong></div>
            <div className="ui-card super-stat-card"><span>Trial organizations</span><strong>{data.summary.trial_organizations}</strong></div>
            <div className="ui-card super-stat-card"><span>Inactive / canceled organizations</span><strong>{data.summary.inactive_canceled_organizations}</strong></div>
            <div className="ui-card super-stat-card"><span>Total events</span><strong>{data.summary.total_events}</strong></div>
            <div className="ui-card super-stat-card"><span>Total ballots</span><strong>{data.summary.total_ballots}</strong></div>
            <div className="ui-card super-stat-card"><span>Total votes cast</span><strong>{data.summary.total_votes_cast}</strong></div>
          </section>

          <section className="ui-grid-2">
            <DonutChart title="Organizations by subscription status" data={data.charts.subscription_status} />
            <DonutChart title="Organizations by organization type" data={data.charts.organization_type} />
          </section>

          <BarChart title="Organizations by estimated voting size" data={data.charts.estimated_voting_size} />

          <section className="ui-card">
            <h3>Trial funnel</h3>
            <div className="super-summary-grid">
              <div className="super-stat-card"><span>Trial orgs total</span><strong>{data.trial_funnel.trial_orgs_total}</strong></div>
              <div className="super-stat-card"><span>Trial orgs with at least 1 event</span><strong>{data.trial_funnel.trial_orgs_with_event}</strong></div>
              <div className="super-stat-card"><span>Trial orgs with at least 1 ballot</span><strong>{data.trial_funnel.trial_orgs_with_ballot}</strong></div>
              <div className="super-stat-card"><span>Trial orgs with at least 1 vote</span><strong>{data.trial_funnel.trial_orgs_with_vote}</strong></div>
              <div className="super-stat-card"><span>Trial orgs converted to paid</span><strong>{data.trial_funnel.trial_orgs_converted_to_paid}</strong></div>
            </div>
          </section>

          <section className="ui-grid-2">
            <section className="ui-card">
              <h3>Recent signups</h3>
              <div className="super-table-wrap">
                <table>
                  <thead>
                    <tr><th>Org</th><th>Created</th><th>Mode</th><th>Type</th></tr>
                  </thead>
                  <tbody>
                    {data.recent_signups.map((row) => (
                      <tr key={`${row.org_name}-${row.created_at}`}>
                        <td><Link to={`/admin/super/org/${row.org_id}`}>{row.org_name}</Link></td>
                        <td>{formatDate(row.created_at)}</td>
                        <td>{row.mode}</td>
                        <td>{row.organization_type || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="ui-card">
              <h3>Recent subscriptions / upgrades</h3>
              <div className="super-table-wrap">
                <table>
                  <thead>
                    <tr><th>Org</th><th>Status</th><th>Current period end</th></tr>
                  </thead>
                  <tbody>
                    {data.recent_subscriptions.map((row) => (
                      <tr key={`${row.org_name}-${row.current_period_end}`}>
                        <td><Link to={`/admin/super/org/${row.org_id}`}>{row.org_name}</Link></td>
                        <td>{row.subscription_status || 'N/A'}</td>
                        <td>{formatDate(row.current_period_end)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="ui-card">
              <h3>Upcoming events (next 14 days)</h3>
              <div className="super-table-wrap">
                <table>
                  <thead>
                    <tr><th>Org</th><th>Event</th><th>Date</th><th>Location</th></tr>
                  </thead>
                  <tbody>
                    {data.upcoming_events.map((row) => (
                      <tr key={`${row.org_name}-${row.event_name}-${row.date}`}>
                        <td>{row.org_name}</td>
                        <td>{row.event_name}</td>
                        <td>{formatDateOnly(row.date)}</td>
                        <td>{row.location || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="ui-card">
              <h3>Top organizations by vote count</h3>
              <div className="super-table-wrap">
                <table>
                  <thead>
                    <tr><th>Org</th><th>Total votes cast</th></tr>
                  </thead>
                  <tbody>
                    {data.top_organizations_by_vote_count.map((row) => (
                      <tr key={row.org_name}>
                        <td><Link to={`/admin/super/org/${row.org_id}`}>{row.org_name}</Link></td>
                        <td>{row.total_votes_cast}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </section>

          <section className="ui-grid-2">
            <section className="ui-card">
              <h3>Billing issues queue</h3>
              <div className="super-table-wrap">
                <table>
                  <thead>
                    <tr><th>Org</th><th>Issue</th><th>Status</th><th>Period end</th></tr>
                  </thead>
                  <tbody>
                    {data.billing_issues.map((row) => (
                      <tr key={`${row.org_id}-${row.issue}`}>
                        <td><Link to={`/admin/super/org/${row.org_id}`}>{row.org_name}</Link></td>
                        <td>{row.issue}</td>
                        <td>{row.subscription_status || 'N/A'}</td>
                        <td>{formatDate(row.current_period_end)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="ui-card">
              <h3>Usage warnings</h3>
              <div className="super-table-wrap">
                <table>
                  <thead>
                    <tr><th>Org</th><th>Plan</th><th>Usage</th><th>Overage</th></tr>
                  </thead>
                  <tbody>
                    {data.usage_warnings.map((row) => (
                      <tr key={row.org_id}>
                        <td><Link to={`/admin/super/org/${row.org_id}`}>{row.org_name}</Link></td>
                        <td>{row.plan_name}</td>
                        <td>{row.votes_used} / {row.allowance}</td>
                        <td>{row.overage_votes > 0 ? `${row.overage_votes} ($${(row.estimated_overage_cents / 100).toFixed(2)})` : row.warning_80 ? 'Above 80%' : '—'}</td>
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
