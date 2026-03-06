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

      <section className="mx-auto mt-8 w-full max-w-4xl rounded-2xl border border-gray-800 bg-gray-900/70 px-8 py-10 shadow-2xl print:border-0 print:bg-white print:text-black">
        <div className="space-y-8 leading-8 text-gray-200">
          <p className="text-gray-300">
            MinistryVote (“MinistryVote,” “we,” “our,” or “us”) provides a voting platform designed for churches,
            ministry networks, nonprofit boards, and similar organizations. This Privacy Policy explains how we
            collect, use, disclose, and protect information when you use our website, platform, and related services.
          </p>

          <p className="text-gray-300">
            By using MinistryVote, you agree to the practices described in this Privacy Policy.
          </p>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">1. Information We Collect</h2>
            <p className="mb-3 text-gray-300">We may collect the following categories of information:</p>

            <h3 className="mb-2 text-lg font-semibold text-blue-300">Account information</h3>
            <ul className="list-disc space-y-1 pl-6 text-gray-300">
              <li>Name</li>
              <li>Email address</li>
              <li>Login credentials</li>
              <li>Role or title</li>
              <li>Organization or church name</li>
            </ul>

            <h3 className="mb-2 mt-5 text-lg font-semibold text-blue-300">Organization and event information</h3>
            <ul className="list-disc space-y-1 pl-6 text-gray-300">
              <li>Organization type</li>
              <li>Event names, ballot names, candidate or choice labels, and related setup information</li>
              <li>PINs generated for voting events</li>
              <li>Administrative notes or configuration data entered by organization administrators</li>
            </ul>

            <h3 className="mb-2 mt-5 text-lg font-semibold text-blue-300">Voting and audit information</h3>
            <ul className="list-disc space-y-1 pl-6 text-gray-300">
              <li>Vote records and related technical records needed to operate the platform</li>
              <li>Vote receipt codes</li>
              <li>Result seals, summaries, and audit log entries</li>
              <li>Ballot round status and timestamps</li>
            </ul>

            <h3 className="mb-2 mt-5 text-lg font-semibold text-blue-300">Contact and support information</h3>
            <ul className="list-disc space-y-1 pl-6 text-gray-300">
              <li>Information you submit through contact forms, support requests, or direct email</li>
            </ul>

            <h3 className="mb-2 mt-5 text-lg font-semibold text-blue-300">Billing information</h3>
            <ul className="list-disc space-y-1 pl-6 text-gray-300">
              <li>Subscription and transaction information processed through Stripe</li>
              <li>Customer identifiers, subscription status, and billing period information</li>
              <li>We do not store full payment card details on our servers</li>
            </ul>

            <h3 className="mb-2 mt-5 text-lg font-semibold text-blue-300">Technical information</h3>
            <ul className="list-disc space-y-1 pl-6 text-gray-300">
              <li>IP address</li>
              <li>Browser type</li>
              <li>Device information</li>
              <li>Log and usage data</li>
              <li>General diagnostic and security information</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">2. How We Use Information</h2>
            <p className="mb-3 text-gray-300">We use information to:</p>
            <ul className="list-disc space-y-1 pl-6 text-gray-300">
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

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">3. How We Share Information</h2>
            <p className="text-gray-300">We do not sell personal information.</p>
            <p className="mt-3 text-gray-300">
              We may share information with service providers that help us operate the platform, including:
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-6 text-gray-300">
              <li>Supabase for database and platform services</li>
              <li>Netlify for hosting and serverless functions</li>
              <li>Stripe for billing and subscription processing</li>
              <li>Resend for transactional email delivery</li>
            </ul>
            <p className="mt-4 text-gray-300">We may also disclose information:</p>
            <ul className="mt-3 list-disc space-y-1 pl-6 text-gray-300">
              <li>To comply with applicable law, regulation, legal process, or enforceable governmental request</li>
              <li>To protect the rights, security, and integrity of MinistryVote, our users, or others</li>
              <li>In connection with a merger, acquisition, financing, or sale of assets</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">4. Organization Responsibilities</h2>
            <p className="mb-3 text-gray-300">Organizations using MinistryVote are responsible for:</p>
            <ul className="list-disc space-y-1 pl-6 text-gray-300">
              <li>Determining who is eligible to vote</li>
              <li>Distributing PINs or other access credentials where required</li>
              <li>Configuring ballots, majority rules, and voting procedures</li>
              <li>Ensuring compliance with their own bylaws, policies, or governing rules</li>
            </ul>
            <p className="mt-4 text-gray-300">
              MinistryVote provides tools to facilitate voting, verification, and recordkeeping, but each organization
              remains responsible for its own governance process.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">5. Data Security</h2>
            <p className="text-gray-300">
              We use reasonable administrative, technical, and organizational safeguards designed to protect
              information and maintain platform integrity. However, no method of transmission or storage is completely
              secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">6. Data Retention</h2>
            <p className="mb-3 text-gray-300">We retain information for as long as reasonably necessary to:</p>
            <ul className="list-disc space-y-1 pl-6 text-gray-300">
              <li>Provide the service</li>
              <li>Maintain official records and audit trails</li>
              <li>Comply with legal, security, accounting, and operational requirements</li>
              <li>Resolve disputes and enforce agreements</li>
            </ul>
            <p className="mt-4 text-gray-300">
              Retention periods may vary depending on the type of data and the needs of the organization using the
              service.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">7. Your Choices</h2>
            <p className="mb-3 text-gray-300">You may:</p>
            <ul className="list-disc space-y-1 pl-6 text-gray-300">
              <li>Access and update certain account information through your account settings</li>
              <li>Contact us regarding support or privacy questions</li>
              <li>Cancel paid subscriptions through the available billing tools or customer portal</li>
              <li>Request account-related assistance by contacting us</li>
            </ul>
            <p className="mt-4 text-gray-300">
              If applicable law gives you specific privacy rights, we will handle requests in accordance with those laws.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">8. Third-Party Services</h2>
            <p className="text-gray-300">
              MinistryVote may link to or rely on third-party services. Their privacy practices are governed by their
              own policies, and we encourage you to review them.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">9. Children’s Privacy</h2>
            <p className="text-gray-300">
              MinistryVote is not directed to children under 13, and we do not knowingly collect personal information
              from children under 13.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">10. Changes to This Policy</h2>
            <p className="text-gray-300">
              We may update this Privacy Policy from time to time. When we do, we will update the “Last updated” date
              above. Continued use of MinistryVote after changes become effective means you accept the updated policy.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">11. Contact Us</h2>
            <p className="text-gray-300">
              If you have questions about this Privacy Policy, you may contact us through the contact page on the site
              or by email at the support address listed there.
            </p>
          </section>
        </div>
      </section>
    </PublicSiteLayout>
  )
}
