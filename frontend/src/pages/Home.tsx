import * as React from 'react'
import { AnalysisList } from '@/components/AnalysisList'
import { ProductForm } from '@/components/ProductForm'

export function Home() {
  const loadDemoRef = React.useRef<(() => void) | null>(null)

  const handleRegisterLoadDemo = React.useCallback((loadDemoFn: () => void) => {
    loadDemoRef.current = loadDemoFn
  }, [])

  const handleTriggerLoadDemo = React.useCallback(() => {
    loadDemoRef.current?.()
    document.getElementById('analysis-form')?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  return (
    <div className="space-y-10">
      {/* Compact hero */}
      <section className="space-y-2.5">
        <p className="text-xs font-medium uppercase tracking-wider text-accent">
          Competitive intelligence
        </p>
        <div>
          <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
            Every claim, with evidence.
          </h1>
          <p className="mt-1.5 text-xs text-muted-foreground font-mono">ஒற்றன்</p>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Continuous competitive tracking that extracts structured claims from public sources, verifies every quote against saved snapshots, and surfaces actionable market intelligence.
        </p>
      </section>

      {/* Setup Form */}
      <ProductForm id="analysis-form" onLoadDemoReady={handleRegisterLoadDemo} />

      {/* Past analyses feed */}
      <AnalysisList onLoadDemo={handleTriggerLoadDemo} />
    </div>
  )
}
