import { useEffect, useState } from 'react'
import { Hero } from '../components/landing/Hero'
import { LoginModal } from '../components/landing/LoginModal'
import { ProblemSection } from '../components/landing/ProblemSection'
import { HowItWorks } from '../components/landing/HowItWorks'
import { GovernanceFeatures } from '../components/landing/GovernanceFeatures'
import { VerifiableResults } from '../components/landing/VerifiableResults'
import { MeetingMoving } from '../components/landing/MeetingMoving'
import { WhoItsFor } from '../components/landing/WhoItsFor'
import { TimeSavings } from '../components/landing/TimeSavings'
import { Pricing } from '../components/landing/Pricing'
import { FinalCTA } from '../components/landing/FinalCTA'
import { Footer } from '../components/landing/Footer'

export function HomePage() {
  const [loginOpen, setLoginOpen] = useState(false)

  useEffect(() => {
    document.title = 'AG Voting - Secure Church & Ministry Elections'

    let meta = document.querySelector('meta[name="description"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'description')
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', 'A verifiable governance voting system designed for churches and ministry networks.')
  }, [])

  return (
    <main className="landing-root bg-gray-950 text-gray-100 antialiased">
      <Hero onOpenLogin={() => setLoginOpen(true)} />
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      <ProblemSection />
      <HowItWorks />
      <GovernanceFeatures />
      <VerifiableResults />
      <MeetingMoving />
      <WhoItsFor />
      <TimeSavings />
      <div id="start">
        <Pricing />
      </div>
      <FinalCTA />
      <Footer />
    </main>
  )
}
