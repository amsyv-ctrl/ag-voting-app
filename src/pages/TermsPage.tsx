import { useEffect } from 'react'
import { PublicPageHero } from '../components/landing/PublicPageHero'
import { PublicSiteLayout } from '../components/landing/PublicSiteLayout'

export function TermsPage() {
  useEffect(() => {
    document.title = 'Terms of Use – MinistryVote'
  }, [])

  return (
    <PublicSiteLayout>
      <PublicPageHero
        title="Terms of Use"
        subtitle="The rules and responsibilities for using MinistryVote."
        lastUpdated="March 5, 2026"
      />

      <section className="mx-auto mt-8 w-full max-w-4xl rounded-2xl border border-gray-800 bg-gray-900/70 px-8 py-10 shadow-2xl print:border-0 print:bg-white print:text-black">
        <div className="space-y-8 leading-8 text-gray-200">
          <p className="text-gray-300">
            These Terms of Use (“Terms”) govern your access to and use of MinistryVote (“MinistryVote,” “we,” “our,”
            or “us”), including our website, platform, and related services.
          </p>

          <p className="text-gray-300">By accessing or using MinistryVote, you agree to these Terms.</p>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">1. Use of the Service</h2>
            <p className="text-gray-300">
              MinistryVote provides tools for churches, ministry networks, nonprofit boards, and similar organizations
              to set up and administer voting events, ballots, records, and related workflows.
            </p>
            <p className="mt-4 text-gray-300">
              You may use the service only in compliance with these Terms and all applicable laws.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">2. Accounts and Eligibility</h2>
            <p className="mb-3 text-gray-300">You are responsible for:</p>
            <ul className="list-disc space-y-1 pl-6 text-gray-300">
              <li>Providing accurate account information</li>
              <li>Maintaining the confidentiality of your login credentials</li>
              <li>All activity that occurs under your account</li>
              <li>Ensuring that users you authorize have appropriate access</li>
            </ul>
            <p className="mt-4 text-gray-300">
              We may suspend or terminate accounts that violate these Terms or create risk to the platform or other users.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">3. Customer Responsibilities</h2>
            <p className="mb-3 text-gray-300">Organizations using MinistryVote are responsible for:</p>
            <ul className="list-disc space-y-1 pl-6 text-gray-300">
              <li>Determining voter eligibility</li>
              <li>Managing check-in and PIN distribution</li>
              <li>Configuring ballots and voting rules</li>
              <li>Ensuring compliance with their own bylaws, policies, constitutions, or procedures</li>
              <li>Reviewing results, exports, and official records</li>
            </ul>
            <p className="mt-4 text-gray-300">
              MinistryVote is a governance voting tool. It does not independently verify whether a particular
              organization’s voting process complies with that organization’s internal governing documents or legal requirements.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">4. Subscription, Billing, and Access</h2>
            <p className="text-gray-300">Certain features require a paid subscription.</p>
            <p className="mt-4 text-gray-300">
              By purchasing a subscription, you agree to pay applicable fees and charges. Subscription billing and
              payment processing are handled through Stripe or another designated billing provider.
            </p>
            <p className="mt-4 text-gray-300">
              If a subscription is canceled, access may continue through the end of the current paid billing period,
              unless otherwise stated.
            </p>
            <p className="mt-4 text-gray-300">
              We may change pricing or plan structures in the future, but changes will not apply retroactively to
              completed billing periods.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">5. Trials and Usage Limits</h2>
            <p className="text-gray-300">
              We may offer free trials, limited usage periods, or plan-based usage limits. We may also enforce limits
              related to votes, ballots, events, or other usage metrics.
            </p>
            <p className="mt-4 text-gray-300">
              Overage pricing, if applicable, will be described in the relevant plan or billing terms.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">6. Acceptable Use</h2>
            <p className="mb-3 text-gray-300">You may not:</p>
            <ul className="list-disc space-y-1 pl-6 text-gray-300">
              <li>Use MinistryVote for unlawful, fraudulent, or deceptive activity</li>
              <li>Attempt to interfere with or disrupt the platform</li>
              <li>Access data or accounts you are not authorized to access</li>
              <li>Reverse engineer, scrape, or misuse the platform</li>
              <li>Use the service in a way that harms the integrity, security, or availability of MinistryVote</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">7. Intellectual Property</h2>
            <p className="text-gray-300">
              MinistryVote and its related software, branding, design, text, graphics, and functionality are owned by
              us or our licensors and are protected by applicable intellectual property laws.
            </p>
            <p className="mt-4 text-gray-300">
              These Terms do not grant you ownership of the platform or any related intellectual property.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">8. Service Availability</h2>
            <p className="text-gray-300">
              We work to provide a reliable service, but MinistryVote is provided on an “as available” and “as offered”
              basis. We do not guarantee uninterrupted availability, error-free operation, or perfect compatibility
              with every device, browser, or network environment.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">9. Records, Receipts, and Verification</h2>
            <p className="text-gray-300">
              MinistryVote may provide vote receipts, integrity seals, audit logs, exports, and related verification
              tools. These features are intended to support transparency and recordkeeping, but organizations remain
              responsible for how they administer and rely upon their own governance processes.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">10. Limitation of Liability</h2>
            <p className="text-gray-300">
              To the fullest extent permitted by law, MinistryVote and its operators will not be liable for indirect,
              incidental, special, consequential, exemplary, or punitive damages, or for loss of profits, revenue,
              goodwill, data, or business opportunity arising out of or related to your use of the service.
            </p>
            <p className="mt-4 text-gray-300">
              Our total liability for claims arising out of or related to the service will not exceed the amount paid
              by the applicable customer to MinistryVote for the service during the twelve months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">11. Disclaimer</h2>
            <p className="text-gray-300">
              MinistryVote provides tools and workflows for governance voting, but does not provide legal advice,
              election law advice, or guarantees of procedural compliance for any specific church, ministry network, or organization.
            </p>
            <p className="mt-4 text-gray-300">
              Organizations should consult their own leadership, governing documents, or legal counsel where appropriate.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">12. Termination</h2>
            <p className="mb-3 text-gray-300">We may suspend or terminate access to the service if:</p>
            <ul className="list-disc space-y-1 pl-6 text-gray-300">
              <li>You violate these Terms</li>
              <li>Your use creates security or operational risk</li>
              <li>Required fees are not paid</li>
              <li>We are required to do so by law</li>
            </ul>
            <p className="mt-4 text-gray-300">You may stop using the service at any time.</p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">13. Changes to the Terms</h2>
            <p className="text-gray-300">
              We may update these Terms from time to time. When we do, we will revise the “Last updated” date above.
              Continued use of the service after updated Terms become effective means you accept the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-2xl font-semibold text-white">14. Contact</h2>
            <p className="text-gray-300">
              If you have questions about these Terms, please contact us through the contact page on the site.
            </p>
          </section>
        </div>
      </section>
    </PublicSiteLayout>
  )
}
