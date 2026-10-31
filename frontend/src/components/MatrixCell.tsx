import * as React from 'react'
import { Award, Flag, Scale } from 'lucide-react'
import type { Advantage, MatrixCell as MatrixCellType, Product } from '@/api/types'
import { ConfidenceBadge } from '@/components/ConfidenceBadge'
import { StatusIcon } from '@/components/StatusIcon'
import { cn } from '@/lib/utils'

interface MatrixCellProps {
  cell: MatrixCellType
  product?: Product
  onOpenClaim?: (claimId: string, allClaimIds?: string[]) => void
  className?: string
}

function AdvantageMarker({ advantage }: { advantage?: Advantage | null }) {
  if (!advantage || advantage === 'unknown') return null
  switch (advantage) {
    case 'ours':
      return (
        <span
          className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent"
          title="Strategic advantage: Our product"
        >
          <Award className="h-3 w-3 shrink-0" />
          <span>Advantage: Ours</span>
        </span>
      )
    case 'theirs':
      return (
        <span
          className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground/80"
          title="Competitor advantage"
        >
          <Flag className="h-3 w-3 shrink-0" />
          <span>Advantage: Theirs</span>
        </span>
      )
    case 'parity':
      return (
        <span
          className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
          title="Feature parity across products"
        >
          <Scale className="h-3 w-3 shrink-0" />
          <span>Parity</span>
        </span>
      )
  }
}

export function MatrixCellComponent({
  cell,
  onOpenClaim,
  className,
}: MatrixCellProps) {
  const isMissing = cell.verification_status === 'missing' || cell.claim_ids.length === 0
  const isContradicted = cell.verification_status === 'contradicted'
  const firstClaimId = cell.claim_ids[0]

  const handleClick = () => {
    if (isMissing || !firstClaimId || !onOpenClaim) return
    onOpenClaim(firstClaimId, cell.claim_ids)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isMissing || !firstClaimId || !onOpenClaim) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpenClaim(firstClaimId, cell.claim_ids)
    }
  }

  if (isMissing) {
    return (
      <div
        className={cn(
          'flex h-full min-h-[108px] flex-col justify-between rounded-xl border border-dashed border-border/70 bg-card/40 p-3.5 text-left text-muted-foreground/60 select-none',
          className,
        )}
      >
        <span className="text-xs italic text-muted-foreground">No public data found</span>
        <div className="flex items-center justify-between pt-2">
          <StatusIcon status="missing" />
          <ConfidenceBadge confidence={0} isMissing />
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      title={isContradicted ? 'Sources disagree (click to view conflicting evidence)' : 'Click to inspect verified evidence'}
      className={cn(
        'group flex h-full min-h-[108px] w-full flex-col justify-between rounded-xl border p-3.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        isContradicted
          ? 'border-warning/60 bg-warning-soft/25 hover:border-warning hover:bg-warning-soft/40 shadow-sm'
          : 'border-border/80 bg-card hover:border-accent/40 hover:bg-muted/30 hover:shadow-sm',
        className,
      )}
    >
      {/* Top: Value & Advantage */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold leading-snug text-foreground group-hover:text-accent transition-colors line-clamp-3">
            {cell.value}
          </p>
        </div>
        <AdvantageMarker advantage={cell.advantage} />
      </div>

      {/* Bottom: Status & Confidence */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 pt-3 border-t border-border/40">
        <StatusIcon status={cell.verification_status} />
        <div className="flex items-center gap-1.5">
          {cell.claim_ids.length > 1 && (
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground" title={`${cell.claim_ids.length} claims recorded`}>
              {cell.claim_ids.length} claims
            </span>
          )}
          <ConfidenceBadge confidence={cell.confidence} />
        </div>
      </div>
    </button>
  )
}
