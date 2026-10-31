import * as React from 'react'
import {
  AlertCircle,
  Clock,
  Filter,
  History,
  Loader2,
  RefreshCw,
  RotateCcw,
} from 'lucide-react'
import type { Analysis, Product, Severity } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ChangeItem } from '@/components/ChangeItem'
import { useChanges } from '@/hooks/useChanges'
import { useRerun } from '@/hooks/useRerun'
import { cn } from '@/lib/utils'

interface ChangeTimelineProps {
  analysis: Analysis
  onOpenClaim?: (claimId: string, allClaimIds?: string[]) => void
  onRerunSuccess?: (updatedAnalysis: Analysis) => void
  className?: string
}

type SeverityFilter = 'all' | Severity

export function ChangeTimeline({
  analysis,
  onOpenClaim,
  onRerunSuccess,
  className,
}: ChangeTimelineProps) {
  const [selectedSeverity, setSelectedSeverity] = React.useState<SeverityFilter>('all')
  const [selectedProductId, setSelectedProductId] = React.useState<string>('all')
  const [showConfirmModal, setShowConfirmModal] = React.useState(false)
  const modalRef = React.useRef<HTMLDivElement | null>(null)
  const modalTriggerRef = React.useRef<HTMLElement | null>(null)

  const openConfirmModal = React.useCallback(() => {
    modalTriggerRef.current = document.activeElement as HTMLElement
    setShowConfirmModal(true)
  }, [])

  const closeConfirmModal = React.useCallback(() => {
    setShowConfirmModal(false)
    if (modalTriggerRef.current) {
      modalTriggerRef.current.focus()
      modalTriggerRef.current = null
    }
  }, [])

  React.useEffect(() => {
    if (!showConfirmModal) return

    // Focus the modal content on open
    window.setTimeout(() => {
      modalRef.current?.focus()
    }, 50)

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeConfirmModal()
        return
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusables = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )
        if (focusables.length === 0) return

        const first = focusables[0]
        const last = focusables[focusables.length - 1]

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first?.focus()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showConfirmModal, closeConfirmModal])

  // Fetch full changes (for count metrics) and filtered changes
  const query = React.useMemo(() => ({
    severity: selectedSeverity === 'all' ? undefined : selectedSeverity,
    product_id: selectedProductId === 'all' ? undefined : selectedProductId,
  }), [selectedSeverity, selectedProductId])

  const {
    data: changes,
    isLoading,
    isError,
    error,
    refetch,
  } = useChanges(analysis.id, query)

  // Unfiltered changes query for header counts
  const { data: allChanges } = useChanges(analysis.id, {})

  // Rerun mutation
  const rerun = useRerun(analysis.id, (updated) => {
    closeConfirmModal()
    onRerunSuccess?.(updated)
  })

  // Sort changes newest first (defensive against server ordering)
  const sortedChanges = React.useMemo(() => {
    if (!changes) return []
    return [...changes].sort((a, b) => b.detected_at.localeCompare(a.detected_at))
  }, [changes])

  // Counts for filters
  const counts = React.useMemo(() => {
    const list = allChanges ?? changes ?? []
    return {
      all: list.length,
      high: list.filter((c) => c.severity === 'high').length,
      medium: list.filter((c) => c.severity === 'medium').length,
      low: list.filter((c) => c.severity === 'low').length,
    }
  }, [allChanges, changes])

  const runNumber = analysis.run_number ?? 1
  const isRunning = analysis.status === 'queued' || analysis.status === 'running'

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header Bar: Summary & Rerun Button */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {counts.all} {counts.all === 1 ? 'change' : 'changes'} detected
              {runNumber > 1 ? ` since run ${runNumber - 1}` : ' in baseline run'}
            </h2>
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-3">
            <span>
              <strong className="text-danger font-semibold">{counts.high}</strong> high
            </span>
            <span>·</span>
            <span>
              <strong className="text-warning font-semibold">{counts.medium}</strong> medium
            </span>
            <span>·</span>
            <span>
              <strong className="text-foreground font-semibold">{counts.low}</strong> low severity
            </span>
          </p>
        </div>

        <Button
          type="button"
          onClick={openConfirmModal}
          disabled={isRunning || rerun.isPending}
          className="h-10 px-5 gap-2 font-medium"
        >
          {rerun.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span>{rerun.isPending ? 'Starting rerun…' : 'Rerun analysis'}</span>
        </Button>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-rerun-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeConfirmModal()
          }}
        >
          <div
            ref={modalRef}
            tabIndex={-1}
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl space-y-4 animate-row-in focus:outline-none"
          >
            <div className="space-y-1.5">
              <h3 id="confirm-rerun-title" className="text-base font-semibold text-foreground">
                Rerun competitive analysis?
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Re-collect all sources and diff against the previous run. New page snapshots will be captured, claims extracted and re-verified.
              </p>
            </div>

            {rerun.isError && (
              <div className="rounded-xl border border-danger/30 bg-danger-soft p-3 text-xs text-danger flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{rerun.error?.message || 'Failed to trigger rerun'}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border/60">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={closeConfirmModal}
                disabled={rerun.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => rerun.mutate()}
                disabled={rerun.isPending}
                className="gap-2"
              >
                {rerun.isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Triggering…</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Confirm & Rerun</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Filters Bar: Severity Chips & Product Dropdown */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Severity filter chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground mr-1 flex items-center gap-1">
            <Filter className="h-3 w-3" />
            <span>Severity:</span>
          </span>
          {(['all', 'high', 'medium', 'low'] as const).map((sev) => {
            const isSelected = selectedSeverity === sev
            const count = counts[sev]
            return (
              <button
                key={sev}
                type="button"
                onClick={() => setSelectedSeverity(sev)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isSelected
                    ? 'border-accent/40 bg-accent text-accent-foreground shadow-2xs'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <span className="capitalize">{sev}</span>
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.2 font-mono text-[10px]',
                    isSelected
                      ? 'bg-accent-foreground/20 text-accent-foreground'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Product selector */}
        <div className="flex items-center gap-2">
          <label htmlFor="product-filter" className="text-xs font-medium text-muted-foreground shrink-0">
            Product:
          </label>
          <select
            id="product-filter"
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
            className="rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">All Products</option>
            {analysis.products.map((p: Product) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.role === 'ours' ? '(Ours)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-6 space-y-3">
              <div className="flex justify-between">
                <Skeleton className="h-5 w-32 rounded-full" />
                <Skeleton className="h-4 w-20" />
              </div>
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div
          className="flex items-center justify-between rounded-2xl border border-danger/30 bg-danger-soft p-6 text-sm text-danger"
          role="alert"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Unable to load changes feed</p>
              <p className="text-xs text-danger/80">{error?.message || 'Failed to fetch changes'}</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void refetch()}
            className="border-danger/30 text-danger hover:bg-danger/10"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !isError && sortedChanges.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/60 p-16 text-center">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Clock className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">
            {runNumber <= 1
              ? 'Baseline captured'
              : 'No changes detected since the previous run'}
          </h3>
          <p className="mt-1.5 max-w-md text-xs text-muted-foreground leading-relaxed">
            {runNumber <= 1
              ? `Run 1 established the initial baseline for ${analysis.products.map((p) => p.name).join(', ')}. Use "Rerun analysis" to collect updated sources and detect changes.`
              : `All current public documentation and pricing match the previous snapshot without detectable changes under the current filters.`}
          </p>
          {runNumber <= 1 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openConfirmModal}
              disabled={isRunning || rerun.isPending}
              className="mt-4 gap-2 text-xs"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Rerun now</span>
            </Button>
          )}
        </div>
      )}

      {/* Changes Vertical Timeline */}
      {!isLoading && !isError && sortedChanges.length > 0 && (
        <div className="relative space-y-4 before:absolute before:inset-0 before:left-5 before:w-0.5 before:bg-border/60 before:hidden sm:before:block">
          {sortedChanges.map((change) => (
            <ChangeItem
              key={change.id}
              change={change}
              products={analysis.products}
              onOpenClaim={onOpenClaim}
            />
          ))}
        </div>
      )}
    </div>
  )
}
