import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { bootstrapOrg, createCheckoutSession, createPortalSession, createTrialEvent } from '../lib/api'
import { getAccessToken, requireSession } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { AdminLayout } from '../components/AdminLayout'
import { PageHero } from '../components/PageHero'
import { StripeModal } from '../components/StripeModal'

type OrgState = {
  id: string
  name: string
  mode: 'DEMO' | 'TRIAL' | 'PAID'
  stripe_customer_id: string | null
  trial_event_id: string | null
  trial_votes_used: number
  trial_votes_limit: number
  subscription_status: string | null
  current_period_end: string | null
  is_active: boolean
  signup_role: string | null
  estimated_voting_size: string | null
  organization_type: string | null
  country: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state_region: string | null
  postal_code: string | null
}

type UsageState = {
  plan_name: 'STARTER' | 'GROWTH' | 'NETWORK' | 'TRIAL' | 'UNKNOWN'
  billing_period_start: string | null
  votes_used: number
  allowance: number
  remaining: number
  overage_votes: number
  estimated_overage_cents: number
  warning_80: boolean
}

type ProfileState = {
  first_name: string
  last_name: string
  network: string
  organization_name: string
  signup_role: string
  estimated_voting_size: string
  organization_type: string
  country: string
  address_line1: string
  address_line2: string
  city: string
  state_region: string
  postal_code: string
}

function formatDate(value: string | null) {
  if (!value) return 'N/A'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

export function AdminOrgPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [role, setRole] = useState<'OWNER' | 'ADMIN' | 'STAFF' | null>(null)
  const [org, setOrg] = useState<OrgState | null>(null)
  const [usage, setUsage] = useState<UsageState | null>(null)
  const [profile, setProfile] = useState<ProfileState>({
    first_name: '',
    last_name: '',
    network: '',
    organization_name: '',
    signup_role: '',
    estimated_voting_size: '',
    organization_type: '',
    country: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state_region: '',
    postal_code: ''
  })
  const [savingProfile, setSavingProfile] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [creatingTrialEvent, setCreatingTrialEvent] = useState(false)
  const [checkoutLoadingPlan, setCheckoutLoadingPlan] = useState<'STARTER' | 'GROWTH' | 'NETWORK' | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [stripeModalOpen, setStripeModalOpen] = useState(false)
  const [stripeUrl, setStripeUrl] = useState<string | null>(null)

  async function load() {
    setError(null)
    setLoading(true)
    const session = await requireSession()
    if (!session) {
      navigate('/admin')
      return
    }
    setUserId(session.user.id)
    setUserEmail((session.user.email ?? '').toLowerCase())

    const token = await getAccessToken()
    if (!token) {
      navigate('/admin')
      return
    }

    try {
      const data = await bootstrapOrg(token)
      setRole(data.role)
      setOrg(data.org)
      setUsage(data.usage)

      const { data: profileData, error: profileError } = await supabase
        .from('admin_profiles')
        .select('first_name,last_name,network,address')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (profileError && profileError.code !== 'PGRST116') {
        throw new Error(profileError.message)
      }

      if (profileData) {
        setProfile({
          first_name: profileData.first_name ?? '',
          last_name: profileData.last_name ?? '',
          network: profileData.network ?? '',
          organization_name: data.org.name ?? '',
          signup_role: data.org.signup_role ?? '',
          estimated_voting_size: data.org.estimated_voting_size ?? '',
          organization_type: data.org.organization_type ?? '',
          country: data.org.country ?? '',
          address_line1: data.org.address_line1 ?? '',
          address_line2: data.org.address_line2 ?? '',
          city: data.org.city ?? '',
          state_region: data.org.state_region ?? '',
          postal_code: data.org.postal_code ?? ''
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load organization')
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

  async function onCreateTrialEvent() {
    if (!org || org.trial_event_id) return
    setNotice(null)
    setError(null)
    setCreatingTrialEvent(true)
    const token = await getAccessToken()
    if (!token) {
      setError('No session token found.')
      setCreatingTrialEvent(false)
      return
    }

    try {
      const data = await createTrialEvent(token)
      navigate(`/admin/events/${data.eventId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create trial event')
    } finally {
      setCreatingTrialEvent(false)
    }
  }

  async function onSaveProfile() {
    if (!userId) return
    setNotice(null)
    setError(null)
    setSavingProfile(true)
    const composedAddress = [
      profile.address_line1.trim(),
      profile.address_line2.trim(),
      [profile.city.trim(), profile.state_region.trim(), profile.postal_code.trim()].filter(Boolean).join(' ')
    ]
      .filter(Boolean)
      .join(', ')

    const { error: updateError } = await supabase
      .from('admin_profiles')
      .upsert({
        user_id: userId,
        first_name: profile.first_name,
        last_name: profile.last_name,
        network: profile.network,
        address: composedAddress || null
      })

    if (updateError) {
      setSavingProfile(false)
      setError(updateError.message)
      return
    }

    if (org?.id) {
      const { error: orgUpdateError } = await supabase
        .from('organizations')
        .update({
          name: profile.organization_name.trim() || org.name,
          signup_role: profile.signup_role || null,
          estimated_voting_size: profile.estimated_voting_size || null,
          organization_type: profile.organization_type || null,
          country: profile.country || null,
          address_line1: profile.address_line1 || null,
          address_line2: profile.address_line2 || null,
          city: profile.city || null,
          state_region: profile.state_region || null,
          postal_code: profile.postal_code || null
        })
        .eq('id', org.id)

      if (orgUpdateError) {
        setSavingProfile(false)
        setError(orgUpdateError.message)
        return
      }
    }

    setSavingProfile(false)
    setNotice('Profile updated.')
    await load()
  }

  async function onCheckout(plan: 'STARTER' | 'GROWTH' | 'NETWORK') {
    setNotice(null)
    setError(null)
    setCheckoutLoadingPlan(plan)

    const token = await getAccessToken()
    if (!token) {
      setError('No session token found.')
      setCheckoutLoadingPlan(null)
      return
    }

    try {
      const data = await createCheckoutSession(token, plan)
      if (!data.url) {
        throw new Error('Checkout URL was not returned.')
      }
      setStripeUrl(data.url)
      setStripeModalOpen(true)
      setCheckoutLoadingPlan(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout')
      setCheckoutLoadingPlan(null)
    }
  }

  async function onManageSubscription() {
    setNotice(null)
    setError(null)
    setPortalLoading(true)

    const token = await getAccessToken()
    if (!token) {
      setError('No session token found.')
      setPortalLoading(false)
      return
    }

    try {
      const data = await createPortalSession(token)
      if (!data.url) {
        throw new Error('Portal URL was not returned.')
      }
      setStripeUrl(data.url)
      setStripeModalOpen(true)
      setPortalLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open subscription portal')
      setPortalLoading(false)
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <section className="ui-card">
          <h1>Account</h1>
          <p>Loading organization...</p>
        </section>
      </AdminLayout>
    )
  }

  const isPaidActive = !!(org?.mode === 'PAID' && org?.is_active)
  const isTrialActive = !!(
    org?.mode === 'TRIAL' &&
    !!org?.trial_event_id &&
    (org?.trial_votes_used ?? 0) < (org?.trial_votes_limit ?? 0)
  )
  const canStartTrialEvent = !!(
    org?.mode === 'TRIAL' &&
    !org?.trial_event_id &&
    (org?.trial_votes_used ?? 0) < (org?.trial_votes_limit ?? 0)
  )
  const isReadOnly = !isPaidActive && !isTrialActive
  const showManageSubscription = !!(org && (org.mode === 'PAID' || org.stripe_customer_id))

  return (
    <AdminLayout
      breadcrumb={['Events', 'Account']}
      onSignOut={onSignOut}
    >
      <PageHero
        title="Account"
        subtitle="Manage subscription, trial usage, and profile settings."
        rightActions={
          <div className="page-hero-actions">
            {userEmail === 'yvincent90@gmail.com' ? (
              <Link to="/admin/super">
                <button className="btn btn-secondary secondary" type="button">Super Admin Dashboard</button>
              </Link>
            ) : null}
            <Link to="/admin">
              <button className="btn btn-secondary secondary" type="button">Events</button>
            </Link>
          </div>
        }
      />
      <section className="form-section">
        {org && (
          <p className={isReadOnly ? 'error' : 'muted'}>
            {isReadOnly
              ? 'Subscription inactive — account is read-only. You can view/export history, but cannot run new votes.'
              : org.mode === 'TRIAL'
                ? `Trial mode: ${org.trial_votes_used}/${org.trial_votes_limit} votes used on your trial event.`
                : 'Paid active: full access enabled.'}
          </p>
        )}
        {error && <p className="error">{error}</p>}
        {notice && <p className="winner">{notice}</p>}
        {org && (
          <>
            <p><strong>Name:</strong> {org.name}</p>
            <p><strong>Role:</strong> {role}</p>
            <p><strong>Mode:</strong> {org.mode}</p>
            <p><strong>Trial usage:</strong> {org.trial_votes_used}/{org.trial_votes_limit} votes</p>
            <p><strong>Subscription status:</strong> {org.subscription_status ?? 'N/A'}</p>
            <p><strong>Current period end:</strong> {formatDate(org.current_period_end)}</p>
            <p><strong>Active:</strong> {org.is_active ? 'Yes' : 'No'}</p>
          </>
        )}
        {usage && (
          <>
            <hr />
            <p><strong>Plan:</strong> {usage.plan_name}</p>
            <p><strong>Votes used this year:</strong> {usage.votes_used} / {usage.allowance}</p>
            {usage.overage_votes > 0 ? (
              <p className="error">
                <strong>Overage:</strong> {usage.overage_votes} votes (${(usage.estimated_overage_cents / 100).toFixed(2)})
              </p>
            ) : (
              <p className="muted">{usage.remaining} votes remaining before overage.</p>
            )}
            <p className="muted">Overage billed at $0.50 per vote.</p>
            {usage.warning_80 && usage.overage_votes === 0 && (
              <p className="error">Warning: usage is above 80% of plan allowance.</p>
            )}
          </>
        )}
      </section>

      <section className="form-section">
        <h2>Subscription</h2>
        <p className="helper-text">Choose a plan based on the number of votes your organization runs each year.</p>
        <p className="helper-text" style={{ marginTop: '0.35rem' }}>Built for church governance — not generic polling.</p>
        <div className="subscription-grid" style={{ marginTop: '0.8rem' }}>
          <article className="ui-card subscription-card">
            <h3 style={{ marginTop: 0 }}>Starter</h3>
            <p className="muted">Best for churches and smaller organizations</p>
            <p><strong>$500 / year</strong></p>
            <p className="muted">Up to 500 votes per year</p>
            <ul className="muted">
              <li>Unlimited events</li>
              <li>Secret ballots and runoff voting</li>
              <li>Vote receipts and integrity-sealed results</li>
            </ul>
            <button className="btn btn-primary" type="button" onClick={() => onCheckout('STARTER')} disabled={checkoutLoadingPlan !== null}>
              {checkoutLoadingPlan === 'STARTER' ? 'Redirecting...' : 'Subscribe now'}
            </button>
          </article>
          <article className="ui-card subscription-card" style={{ borderColor: '#1d4ed8' }}>
            <h3 style={{ marginTop: 0 }}>Growth</h3>
            <p className="muted">Ideal for larger churches and regional ministries</p>
            <p><strong>$1,500 / year</strong></p>
            <p className="muted">Up to 2,000 votes per year</p>
            <ul className="muted">
              <li>Everything in Starter</li>
              <li>Higher capacity for multiple meetings</li>
              <li>Great for annual meetings and board elections</li>
            </ul>
            <button className="btn btn-primary" type="button" onClick={() => onCheckout('GROWTH')} disabled={checkoutLoadingPlan !== null}>
              {checkoutLoadingPlan === 'GROWTH' ? 'Redirecting...' : 'Subscribe now'}
            </button>
          </article>
          <article className="ui-card subscription-card">
            <h3 style={{ marginTop: 0 }}>Network</h3>
            <p className="muted">Designed for district or network conferences</p>
            <p><strong>$3,000 / year</strong></p>
            <p className="muted">Up to 5,000 votes per year</p>
            <ul className="muted">
              <li>Everything in Growth</li>
              <li>Capacity for large conferences</li>
              <li>Multiple runoff rounds and network-scale governance voting</li>
            </ul>
            <button className="btn btn-primary" type="button" onClick={() => onCheckout('NETWORK')} disabled={checkoutLoadingPlan !== null}>
              {checkoutLoadingPlan === 'NETWORK' ? 'Redirecting...' : 'Subscribe now'}
            </button>
          </article>
        </div>
        {showManageSubscription && (
          <div className="form-actions" style={{ marginTop: '0.8rem' }}>
            <button className="btn btn-secondary" type="button" onClick={onManageSubscription} disabled={portalLoading}>
              {portalLoading ? 'Opening portal...' : 'Manage subscription'}
            </button>
          </div>
        )}
        <p className="muted" style={{ marginTop: '0.6rem' }}>
          You can manage or cancel your subscription anytime. If you cancel, access remains active until the end of your billing period.
        </p>
      </section>

      <section className="form-section">
        <h2>Trial Onboarding</h2>
        {!org?.trial_event_id ? (
          <p className="muted">Trial not started.</p>
        ) : org.trial_votes_used >= org.trial_votes_limit ? (
          <p className="error">Trial limit reached: {org.trial_votes_used}/{org.trial_votes_limit} votes used.</p>
        ) : (
          <p className="muted">Trial active: {org.trial_votes_used}/{org.trial_votes_limit} votes used.</p>
        )}
        <div className="form-actions">
          <button
            className="btn btn-primary"
            onClick={onCreateTrialEvent}
            disabled={creatingTrialEvent || !canStartTrialEvent}
          >
            {creatingTrialEvent ? 'Creating trial event...' : 'Create your free trial event (100 votes)'}
          </button>
          {org?.trial_event_id && (
            <Link to={`/admin/events/${org.trial_event_id}`}>
              <button className="btn btn-secondary" type="button">Go to trial event</button>
            </Link>
          )}
        </div>
      </section>

      <section className="form-section">
        <h2>Edit Profile</h2>
        <div className="form-grid">
          <label className="form-row">
            First name
            <input
              className="input"
              value={profile.first_name}
              onChange={(e) => setProfile((p) => ({ ...p, first_name: e.target.value }))}
            />
          </label>
          <label className="form-row">
            Last name
            <input
              className="input"
              value={profile.last_name}
              onChange={(e) => setProfile((p) => ({ ...p, last_name: e.target.value }))}
            />
          </label>
          <label className="form-row">
            Network
            <input
              className="input"
              value={profile.network}
              onChange={(e) => setProfile((p) => ({ ...p, network: e.target.value }))}
            />
          </label>
          <label className="form-row">
            Church or Organization Name
            <input
              className="input"
              value={profile.organization_name}
              onChange={(e) => setProfile((p) => ({ ...p, organization_name: e.target.value }))}
              required
            />
          </label>
          <label className="form-row">
            Your Role
            <select
              className="select"
              value={profile.signup_role}
              onChange={(e) => setProfile((p) => ({ ...p, signup_role: e.target.value }))}
            >
              <option value="">Select role (optional)</option>
              <option value="Lead Pastor">Lead Pastor</option>
              <option value="Executive Pastor">Executive Pastor</option>
              <option value="Church Staff">Church Staff</option>
              <option value="Board Member">Board Member</option>
              <option value="District / Network Staff">District / Network Staff</option>
              <option value="Other">Other</option>
            </select>
          </label>
          <label className="form-row">
            Estimated Voting Size
            <select
              className="select"
              value={profile.estimated_voting_size}
              onChange={(e) => setProfile((p) => ({ ...p, estimated_voting_size: e.target.value }))}
            >
              <option value="">Select voting size (optional)</option>
              <option value="10–50">10–50</option>
              <option value="50–100">50–100</option>
              <option value="100–250">100–250</option>
              <option value="250–500">250–500</option>
              <option value="500+">500+</option>
            </select>
          </label>
          <label className="form-row">
            Organization Type
            <select
              className="select"
              value={profile.organization_type}
              onChange={(e) => setProfile((p) => ({ ...p, organization_type: e.target.value }))}
            >
              <option value="">Select type (optional)</option>
              <option value="Local Church">Local Church</option>
              <option value="District / Network">District / Network</option>
              <option value="Ministry Organization">Ministry Organization</option>
              <option value="Nonprofit Board">Nonprofit Board</option>
            </select>
          </label>
          <label className="form-row">
            Country
            <input
              className="input"
              value={profile.country}
              onChange={(e) => setProfile((p) => ({ ...p, country: e.target.value }))}
            />
          </label>
          <label className="form-row">
            Address line 1
            <input
              className="input"
              value={profile.address_line1}
              onChange={(e) => setProfile((p) => ({ ...p, address_line1: e.target.value }))}
            />
          </label>
          <label className="form-row">
            Address line 2
            <input
              className="input"
              value={profile.address_line2}
              onChange={(e) => setProfile((p) => ({ ...p, address_line2: e.target.value }))}
            />
          </label>
          <label className="form-row">
            City
            <input
              className="input"
              value={profile.city}
              onChange={(e) => setProfile((p) => ({ ...p, city: e.target.value }))}
            />
          </label>
          <label className="form-row">
            State / Region
            <input
              className="input"
              value={profile.state_region}
              onChange={(e) => setProfile((p) => ({ ...p, state_region: e.target.value }))}
            />
          </label>
          <label className="form-row">
            Postal code
            <input
              className="input"
              value={profile.postal_code}
              onChange={(e) => setProfile((p) => ({ ...p, postal_code: e.target.value }))}
            />
          </label>
          <div className="form-actions form-row-full">
            <button className="btn btn-primary" onClick={onSaveProfile} disabled={savingProfile}>
              {savingProfile ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </div>
      </section>
      <StripeModal
        isOpen={stripeModalOpen}
        url={stripeUrl}
        onClose={() => {
          setStripeModalOpen(false)
          setStripeUrl(null)
          load()
        }}
      />
    </AdminLayout>
  )
}
