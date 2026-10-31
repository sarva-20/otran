import * as React from 'react'
import { AlertCircle, ExternalLink, RotateCcw } from 'lucide-react'
import type { CellStatus, Matrix } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { MatrixCellComponent } from '@/components/MatrixCell'
import { humanizeDimension } from '@/lib/format'
import { cn } from '@/lib/utils'

interface MatrixTableProps {
  matrix?: Matrix
  isLoading?: boolean
  isError?: boolean
  error?: Error | null
  onRetry?: () => void
  onOpenClaim?: (claimId: string, allClaimIds?: string[]) => void
  className?: string
}

type StatusFilter = 'all' | CellStatus

const FILTER_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'verified', label: 'Verified' },
  { key: 'unverified', label: 'Unverified' },
  { key: 'contradicted', label: 'Contradicted' },
  { key: 'missing', label: 'Missing' },
]

export function MatrixTable({
  matrix,
  isLoading,
  isError,
  error,
  onRetry,
  onOpenClaim,
  className,
}: MatrixTableProps) {
  const [activeFilter, setActiveFilter] = React.useState<StatusFilter>('all')

  if (isLoading) {
    return (
      <div className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-8 w-24 rounded-full" />
          ))}
        </div>
        <div className="space-y-3 pt-2">
          {[1, 2, 3].map((row) => (
            <div key={row} className="grid grid-cols-4 gap-3">
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-28 rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (isError || !matrix) {
    return (
      <div
        className="flex items-center justify-between rounded-2xl border border-danger/30 bg-danger-soft p-6 text-sm text-danger"
        role="alert"
      >
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Unable to load comparison matrix</p>
            <p className="text-xs text-danger/80">{error?.message || 'Matrix data not available'}</p>
          </div>
        </div>
        {onRetry && (
          <Button
            size="sm"
            variant="outline"
            onClick={onRetry}
            className="border-danger/30 text-danger hover:bg-danger/10"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Retry
          </Button>
        )}
      </div>
    )
  }

  const { products, dimensions, cells } = matrix

  if (dimensions.length === 0 || products.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/60 p-12 text-center">
        <p className="text-sm font-medium text-foreground">No comparison matrix data available</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Run the discovery and collector agents to populate claims and matrix dimensions.
        </p>
      </div>
    )
  }

  // Calculate filter counts per status across all dimensions
  const counts: Record<StatusFilter, number> = {
    all: dimensions.length,
    verified: dimensions.filter((d) =>
      cells.some((c) => c.dimension === d && c.verification_status === 'verified'),
    ).length,
    unverified: dimensions.filter((d) =>
      cells.some((c) => c.dimension === d && c.verification_status === 'unverified'),
    ).length,
    contradicted: dimensions.filter((d) =>
      cells.some((c) => c.dimension === d && c.verification_status === 'contradicted'),
    ).length,
    missing: dimensions.filter((d) =>
      cells.some((c) => c.dimension === d && c.verification_status === 'missing'),
    ).length,
  }

  // Filter dimensions
  const filteredDimensions = dimensions.filter((d) => {
    if (activeFilter === 'all') return true
    return cells.some((c) => c.dimension === d && c.verification_status === activeFilter)
  })

  return (
    <div className={cn('space-y-4', className)}>
      {/* Filter chips bar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground mr-1">Filter rows:</span>
        {FILTER_OPTIONS.map((opt) => {
          const isSelected = activeFilter === opt.key
          const count = counts[opt.key]
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => setActiveFilter(opt.key)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isSelected
                  ? 'border-accent/40 bg-accent text-accent-foreground shadow-sm'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <span>{opt.label}</span>
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.2 font-mono text-[10px]',
                  isSelected ? 'bg-accent-foreground/20 text-accent-foreground' : 'bg-muted text-muted-foreground',
                )}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Comparison Matrix Table */}
      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border/80 bg-muted/40">
              {/* Sticky first column header: Dimension */}
              <th className="sticky left-0 z-20 w-48 min-w-[192px] border-r border-border/60 bg-muted/90 p-4 backdrop-blur">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Dimension
                </span>
              </th>

              {/* Product column headers */}
              {products.map((product) => {
                const isOurs = product.role === 'ours'
                return (
                  <th
                    key={product.id}
                    className={cn(
                      'min-w-[240px] p-4 align-top border-r last:border-r-0 border-border/60',
                      isOurs ? 'bg-primary/[0.03]' : 'bg-transparent',
                    )}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase',
                            isOurs
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground border border-border/60',
                          )}
                        >
                          {isOurs ? 'Our Product' : 'Competitor'}
                        </span>
                        <a
                          href={product.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          title={`Open ${product.name} website in new tab`}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>

                      <div
                        className={cn(
                          'text-sm font-semibold tracking-tight text-foreground',
                          isOurs && 'text-primary underline decoration-primary/30 underline-offset-4',
                        )}
                      >
                        {product.name}
                      </div>
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-border/60">
            {filteredDimensions.length === 0 ? (
              <tr>
                <td
                  colSpan={products.length + 1}
                  className="p-12 text-center text-sm text-muted-foreground"
                >
                  No dimensions found matching status filter "{activeFilter}".
                </td>
              </tr>
            ) : (
              filteredDimensions.map((dim) => (
                <tr key={dim} className="group transition-colors hover:bg-muted/10">
                  {/* Sticky Dimension label */}
                  <th className="sticky left-0 z-10 w-48 min-w-[192px] border-r border-border/60 bg-card/95 p-4 align-top backdrop-blur shadow-[2px_0_4px_-2px_rgba(0,0,0,0.05)]">
                    <div className="space-y-1">
                      <span className="text-sm font-semibold text-foreground">
                        {humanizeDimension(dim)}
                      </span>
                      <p className="font-mono text-[11px] text-muted-foreground">{dim}</p>
                    </div>
                  </th>

                  {/* Product cells */}
                  {products.map((product) => {
                    const isOurs = product.role === 'ours'
                    const cell = cells.find(
                      (c) => c.product_id === product.id && c.dimension === dim,
                    ) ?? {
                      product_id: product.id,
                      dimension: dim,
                      value: 'No public data found',
                      verification_status: 'missing' as const,
                      confidence: 0,
                      claim_ids: [],
                      advantage: 'unknown' as const,
                    }

                    return (
                      <td
                        key={`${dim}-${product.id}`}
                        className={cn(
                          'p-3 align-top border-r last:border-r-0 border-border/60',
                          isOurs && 'bg-primary/[0.015]',
                        )}
                      >
                        <MatrixCellComponent
                          cell={cell}
                          product={product}
                          onOpenClaim={onOpenClaim}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
