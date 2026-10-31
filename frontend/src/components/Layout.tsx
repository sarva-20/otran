import { Link, Outlet } from 'react-router-dom'
import { USE_MOCK } from '@/api/client'
import { EvidenceDrawer } from '@/components/EvidenceDrawer'
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
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between px-6">
          <Link to="/" className="flex items-baseline gap-2" aria-label="Otran home">
            <span className="text-lg font-semibold tracking-tight">Otran</span>
            <span className="text-[11px] text-muted-foreground">ஒற்றன்</span>
          </Link>
          <HealthPill />
        </div>
      </header>
      <main className="mx-auto max-w-[1280px] px-6 py-10">
        <Outlet />
      </main>
      <EvidenceDrawer />
    </div>
  )
}
