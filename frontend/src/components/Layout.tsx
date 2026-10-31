import { Link, Outlet } from 'react-router-dom'
import { USE_MOCK } from '@/api/client'
import { EvidenceDrawer } from '@/components/EvidenceDrawer'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useHealth } from '@/hooks/useHealth'
import { cn } from '@/lib/utils'

function HealthPill() {
  const { data, isError, isLoading } = useHealth()
  const label = isLoading ? 'Checking…' : isError ? 'API unreachable' : `${data?.llm_provider ?? 'llm'} · ${data?.llm_model ?? ''}`
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {USE_MOCK && (
        <span className="rounded-full border border-border bg-card px-2.5 py-1 font-medium text-foreground">Mock data</span>
      )}
      <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 font-mono">
        <span
          aria-hidden
          className={cn('h-1.5 w-1.5 rounded-full', isError ? 'bg-danger' : isLoading ? 'bg-muted-foreground' : 'bg-success')}
        />
        {label}
      </span>
    </div>
  )
}

export function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground transition-colors duration-150">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>

      <header role="banner" className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between px-6">
          <Link to="/" className="flex items-baseline gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md" aria-label="Otran home">
            <span className="text-lg font-semibold tracking-tight">Otran</span>
            <span className="text-[11px] text-muted-foreground">ஒற்றன்</span>
          </Link>
          <div className="flex items-center gap-3">
            <HealthPill />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1280px] flex-1 px-6 py-10 focus:outline-none">
        <Outlet />
      </main>
      <EvidenceDrawer />
    </div>
  )
}
