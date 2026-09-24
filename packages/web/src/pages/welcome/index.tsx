import { useEffect } from 'react'
import { WelcomeCta } from './welcome-cta'
import { WelcomeFeatures } from './welcome-features'
import { WelcomeFooter } from './welcome-footer'
import { WelcomeHero } from './welcome-hero'
import { WelcomeNav } from './welcome-nav'
import { WelcomeStats } from './welcome-stats'

export default function WelcomePage() {
  useEffect(() => {
    const previousTitle = document.title
    document.title = 'InboxFM Connect — AI-first workflow automation'
    return () => {
      document.title = previousTitle
    }
  }, [])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <WelcomeNav />
      <main>
        <WelcomeHero />
        <WelcomeStats />
        <WelcomeFeatures />
        <WelcomeCta />
      </main>
      <WelcomeFooter />
    </div>
  )
}
