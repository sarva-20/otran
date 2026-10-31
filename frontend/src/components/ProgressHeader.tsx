import * as React from 'react'
import { CheckCircle2, Clock, Loader2, RefreshCw, XCircle } from 'lucide-react'
import type { AgentEvent, Analysis, AnalysisStatus } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getAgentConfig } from '@/lib/colors'
import { cn } from '@/lib/utils'

interface ProgressHeaderProps {
  analysis: Analysis
  latestEvent?: AgentEvent
  isRunning?: boolean
  onRerun?: () => void
  isRerunning?: boolean
  className?: string
}

function StatusChip({ status }: { status: AnalysisStatus }) {
  switch (status) {
    case 'completed':
      return (
        <Badge variant="success">
          <CheckCircle2 className="h-3 w-3" />
          <span>Completed</span>
        </Badge>
      )
    case 'running':
      return (
        <Badge variant="accent">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Running</span>
        </Badge>
      )
    case 'failed':
      return (
        <Badge variant="danger">
          <XCircle className="h-3 w-3" />
          <span>Failed</span>
        </Badge>
      )
    case 'queued':
    default:
      return (
        <Badge variant="secondary">
          <Clock className="h-3 w-3" />
          <span>Queued</span>
        </Badge>
      )
  }
}

function StatBox({ value = 0, label }: { value?: number; label: string }) {
  const [highlight, setHighlight] = React.useState(false)
  const prevValue = React.useRef(value)

  React.useEffect(() => {
    if (prevValue.current !== value) {
      prevValue.current = value
      setHighlight(true)
      const timer = setTimeout(() => setHighlight(false), 500)
      return () => clearTimeout(timer)
    }
  }, [value])

  return (
    <div className="flex min-w-[76px] flex-col items-center rounded-xl border border-border/80 bg-card px-3 py-2 text-center transition-all">
      <span
        className={cn(
          'font-mono text-lg font-semibold leading-tight transition-all duration-200',
          highlight ? 'scale-110 text-accent' : 'text-foreground',
        )}
      >
        {value}
      </span>
      <span className="mt-0.5 text-[11px] font-medium text-muted-foreground">{label}</span>
    </div>
  )
}

export function ProgressHeader({
  analysis,
  latestEvent,
  isRunning = false,
  onRerun,
  isRerunning = false,
  className,
}: ProgressHeaderProps) {
  const ourProduct = analysis.products.find((p) => p.role === 'ours')
  const competitors = analysis.products.filter((p) => p.role === 'competitor')
  const currentAgent = latestEvent ? getAgentConfig(latestEvent.agent) : null
  const stats = analysis.stats ?? {}

  return (
    <div className={cn('space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm', className)}>
      {/* Top row: Title, status, run, and active agent */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
            <span className="underline decoration-primary/40 underline-offset-4">
              {ourProduct?.name ?? 'Our Product'}
            </span>
            <span className="text-base font-normal text-muted-foreground">vs</span>
            <span className="text-foreground/80">
              {competitors.map((c) => c.name).join(', ') || 'No competitors'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground">
            <span className="font-mono">run {analysis.run_number ?? 1}</span>
            <span>·</span>
            <span className="font-mono">{analysis.id}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 sm:justify-end">
          {currentAgent && (
            <div className="flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs">
              {isRunning && (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                </span>
              )}
              <span className="text-muted-foreground">Agent:</span>
              <span className="font-medium text-foreground">{currentAgent.label}</span>
            </div>
          )}
          <StatusChip status={analysis.status} />
          {onRerun && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRerun}
              disabled={isRunning || isRerunning}
              className="h-7 px-2.5 text-xs gap-1.5"
              title="Rerun analysis"
            >
              {isRerunning ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              <span>Rerun</span>
            </Button>
          )}
        </div>
      </div>

      {/* Stats counter strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-3">
        <StatBox value={stats.sources_collected ?? 0} label="Sources" />
        <StatBox value={stats.claims_total ?? 0} label="Claims" />
        <StatBox value={stats.claims_verified ?? 0} label="Verified" />
        <StatBox value={stats.claims_contradicted ?? 0} label="Contradicted" />
        <StatBox value={stats.changes_detected ?? 0} label="Changes" />
      </div>
    </div>
  )
}
