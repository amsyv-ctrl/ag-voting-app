import { useEffect } from 'react'
import { PublicPageHero } from '../components/landing/PublicPageHero'
import { PublicSiteLayout } from '../components/landing/PublicSiteLayout'

export function PrivacyPage() {
  useEffect(() => {
    document.title = 'Privacy Policy – MinistryVote'
  }, [])

  return (
    <PublicSiteLayout>
      <PublicPageHero
        title="Privacy Policy"
        subtitle="How MinistryVote collects, uses, and protects information."
        lastUpdated="March 5, 2026"
      />

      <section className="legal-reading-shell">
        <div className="public-card-surface legal-document print:border-0 print:bg-white print:text-black">
          <p>
            MinistryVote (“MinistryVote,” “we,” “our,” or “us”) provides a voting platform designed for churches,
            ministry networks, nonprofit boards, and similar organizations. This Privacy Policy explains how we
            collect, use, disclose, and protect information when you use our website, platform, and related services.
          </p>

          <p>
            By using MinistryVote, you agree to the practices described in this Privacy Policy.
          </p>

          <section className="legal-section">
            <h2>1. Information We Collect</h2>
            <p>We may collect the following categories of information:</p>

            <h3>Account information</h3>
            <ul>
              <li>Name</li>
              <li>Email address</li>
              <li>Login credentials</li>
              <li>Role or title</li>
              <li>Organization or church name</li>
            </ul>

            <h3>Organization and event information</h3>
            <ul>
              <li>Organization type</li>
              <li>Event names, ballot names, candidate or choice labels, and related setup information</li>
              <li>PINs generated for voting events</li>
              <li>Administrative notes or configuration data entered by organization administrators</li>
            </ul>

            <h3>Voting and audit information</h3>
            <ul>
              <li>Vote records and related technical records needed to operate the platform</li>
              <li>Vote receipt codes</li>
              <li>Result seals, summaries, and audit log entries</li>
              <li>Ballot round status and timestamps</li>
            </ul>

            <h3>Contact and support information</h3>
            <ul>
              <li>Information you submit through contact forms, support requests, or direct email</li>
            </ul>

            <h3>Billing information</h3>
            <ul>
              <li>Subscription and transaction information processed through Stripe</li>
              <li>Customer identifiers, subscription status, and billing period information</li>
              <li>We do not store full payment card details on our servers</li>
            </ul>

            <h3>Technical information</h3>
            <ul>
              <li>IP address</li>
              <li>Browser type</li>
              <li>Device information</li>
              <li>Log and usage data</li>
              <li>General diagnostic and security information</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>2. How We Use Information</h2>
            <p>We use information to:</p>
            <ul>
              <li>Provide, operate, and improve MinistryVote</li>
              <li>Create and manage accounts and organizations</li>
              <li>Process votes, generate receipts, seals, and official records</li>
              <li>Support secure voting workflows, including PIN-based voting where enabled</li>
              <li>Send transactional emails, including account and service communications</li>
              <li>Respond to contact requests and support inquiries</li>
              <li>Process subscriptions, billing, and account management</li>
              <li>Maintain platform security, integrity, and reliability</li>
              <li>Detect misuse, fraud, or unauthorized activity</li>
              <li>Comply with legal obligations and enforce our terms</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>3. How We Share Information</h2>
            <p>We do not sell personal information.</p>
            <p>
              We may share information with service providers that help us operate the platform, including:
            </p>
            <ul>
              <li>Supabase for database and platform services</li>
              <li>Netlify for hosting and serverless functions</li>
              <li>Stripe for billing and subscription processing</li>
              <li>Resend for transactional email delivery</li>
            </ul>
            <p>We may also disclose information:</p>
            <ul>
              <li>To comply with applicable law, regulation, legal process, or enforceable governmental request</li>
              <li>To protect the rights, security, and integrity of MinistryVote, our users, or others</li>
              <li>In connection with a merger, acquisition, financing, or sale of assets</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>4. Organization Responsibilities</h2>
            <p>Organizations using MinistryVote are responsible for:</p>
            <ul>
              <li>Determining who is eligible to vote</li>
              <li>Distributing PINs or other access credentials where required</li>
              <li>Configuring ballots, majority rules, and voting procedures</li>
              <li>Ensuring compliance with their own bylaws, policies, or governing rules</li>
            </ul>
            <p>
              MinistryVote provides tools to facilitate voting, verification, and recordkeeping, but each organization
              remains responsible for its own governance process.
            </p>
          </section>

          <section className="legal-section">
            <h2>5. Data Security</h2>
            <p>
              We use reasonable administrative, technical, and organizational safeguards designed to protect
              information and maintain platform integrity. However, no method of transmission or storage is completely
              secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section className="legal-section">
            <h2>6. Data Retention</h2>
            <p>We retain information for as long as reasonably necessary to:</p>
            <ul>
              <li>Provide the service</li>
              <li>Maintain official records and audit trails</li>
              <li>Comply with legal, security, accounting, and operational requirements</li>
              <li>Resolve disputes and enforce agreements</li>
            </ul>
            <p>
              Retention periods may vary depending on the type of data and the needs of the organization using the
              service.
            </p>
          </section>

          <section className="legal-section">
            <h2>7. Your Choices</h2>
            <p>You may:</p>
            <ul>
              <li>Access and update certain account information through your account settings</li>
              <li>Contact us regarding support or privacy questions</li>
              <li>Cancel paid subscriptions through the available billing tools or customer portal</li>
              <li>Request account-related assistance by contacting us</li>
            </ul>
            <p>
              If applicable law gives you specific privacy rights, we will handle requests in accordance with those laws.
            </p>
          </section>

          <section className="legal-section">
            <h2>8. Third-Party Services</h2>
            <p>
              MinistryVote may link to or rely on third-party services. Their privacy practices are governed by their
              own policies, and we encourage you to review them.
            </p>
          </section>

          <section className="legal-section">
            <h2>9. Children’s Privacy</h2>
            <p>
              MinistryVote is not directed to children under 13, and we do not knowingly collect personal information
              from children under 13.
            </p>
          </section>

          <section className="legal-section">
            <h2>10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. When we do, we will update the “Last updated” date
              above. Continued use of MinistryVote after changes become effective means you accept the updated policy.
            </p>
          </section>

          <section className="legal-section">
            <h2>11. Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy, you may contact us through the contact page on the site
              or by email at the support address listed there.
            </p>
          </section>
        </div>
      </section>
    </PublicSiteLayout>
  )
}
