import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Loader2,
  RotateCcw,
  Sparkles,
  XCircle,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Analysis, AnalysisStatus } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAnalyses } from '@/hooks/useAnalyses'
import { formatRelativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'

interface AnalysisListProps {
  onLoadDemo?: () => void
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

function AnalysisRow({ analysis }: { analysis: Analysis }) {
  const ourProduct = analysis.products.find((p) => p.role === 'ours')
  const competitors = analysis.products.filter((p) => p.role === 'competitor')
  const isLive = analysis.status === 'running' || analysis.status === 'queued'

  const hasStats =
    analysis.stats &&
    (analysis.stats.claims_verified !== undefined ||
      analysis.stats.claims_contradicted !== undefined ||
      analysis.stats.changes_detected !== undefined)

  return (
    <Link
      to={`/analysis/${analysis.id}`}
      className="group block rounded-xl border border-border bg-card p-4 transition-all hover:border-accent/40 hover:shadow-sm"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: Product comparison and metadata */}
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            {isLive && (
              <span className="relative mr-1 flex h-2 w-2" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
              </span>
            )}
            <span className="font-semibold text-foreground underline decoration-primary/30 underline-offset-4">
              {ourProduct?.name ?? 'Our Product'}
            </span>
            <span className="text-xs text-muted-foreground">vs</span>
            <span className="font-medium text-foreground/80">
              {competitors.length > 0
                ? competitors.map((c) => c.name).join(', ')
                : 'No competitors'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="font-mono">run {analysis.run_number ?? 1}</span>
            <span>·</span>
            <span>{formatRelativeTime(analysis.created_at)}</span>
            {hasStats && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1.5">
                  <span>
                    <strong className="font-semibold text-foreground">
                      {analysis.stats?.claims_verified ?? 0}
                    </strong>{' '}
                    verified
                  </span>
                  <span>/</span>
                  <span>
                    <strong className="font-semibold text-foreground">
                      {analysis.stats?.claims_contradicted ?? 0}
                    </strong>{' '}
                    contradicted
                  </span>
                  <span>/</span>
                  <span>
                    <strong className="font-semibold text-foreground">
                      {analysis.stats?.changes_detected ?? 0}
                    </strong>{' '}
                    changes
                  </span>
                </span>
              </>
            )}
          </div>
        </div>

        {/* Right: Status chip and arrow */}
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <StatusChip status={analysis.status} />
          <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
        </div>
      </div>
    </Link>
  )
}

export function AnalysisList({ onLoadDemo, className }: AnalysisListProps) {
  const { data, isLoading, isError, error, refetch } = useAnalyses()

  return (
    <section aria-labelledby="past-analyses" className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h2 id="past-analyses" className="text-base font-semibold tracking-tight">
          Past analyses
        </h2>
        {data && data.length > 0 && (
          <span className="font-mono text-xs text-muted-foreground">
            {data.length} {data.length === 1 ? 'run' : 'runs'}
          </span>
        )}
      </div>

      {isLoading && (
        <div className="space-y-3" role="status" aria-label="Loading analyses">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
            >
              <div className="space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-4 w-4" />
              </div>
            </div>
          ))}
        </div>
      )}

      {isError && (
        <div
          className="flex items-center justify-between rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger"
          role="alert"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error?.message || 'Failed to load analyses'}</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void refetch()}
            className="border-danger/30 text-danger hover:bg-danger-soft"
          >
            <RotateCcw className="h-3 w-3" />
            Retry
          </Button>
        </div>
      )}

      {!isLoading && !isError && data && data.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center">
          <p className="text-sm text-muted-foreground">No analyses yet. Load the demo to see one.</p>
          {onLoadDemo && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onLoadDemo}
              className="mt-3 text-xs"
            >
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              Load demo
            </Button>
          )}
        </div>
      )}

      {!isLoading && !isError && data && data.length > 0 && (
        <div className="space-y-3">
          {data.map((analysis) => (
            <AnalysisRow key={analysis.id} analysis={analysis} />
          ))}
        </div>
      )}
    </section>
  )
}
