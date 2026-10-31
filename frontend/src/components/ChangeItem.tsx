import * as React from 'react'
import { ExternalLink, Layers, Sparkles } from 'lucide-react'
import type { Change, ChangeType, Product } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import { DiffBlock } from '@/components/DiffBlock'
import { SeverityChip } from '@/components/SeverityChip'
import { formatRelativeTime, humanizeDimension } from '@/lib/format'
import { cn } from '@/lib/utils'

interface ChangeItemProps {
  change: Change
  products?: Product[]
  onOpenClaim?: (claimId: string, allClaimIds?: string[]) => void
  className?: string
}

function ChangeTypeChip({ type }: { type: ChangeType }) {
  switch (type) {
    case 'added':
      return (
        <Badge variant="accent" className="font-mono text-[10px] tracking-wide uppercase">
          + Added
        </Badge>
      )
    case 'removed':
      return (
        <Badge variant="secondary" className="font-mono text-[10px] tracking-wide uppercase text-muted-foreground">
          - Removed
        </Badge>
      )
    case 'modified':
    default:
      return (
        <Badge variant="outline" className="font-mono text-[10px] tracking-wide uppercase">
          ~ Modified
        </Badge>
      )
  }
}

export function ChangeItem({
  change,
  products = [],
  onOpenClaim,
  className,
}: ChangeItemProps) {
  const product = products.find((p) => p.id === change.product_id)
  const productName = product?.name ?? change.product_id
  const hasClaims = Boolean(change.claim_ids && change.claim_ids.length > 0)
  const firstClaimId = change.claim_ids?.[0]

  const handleClick = () => {
    if (!hasClaims || !firstClaimId || !onOpenClaim) return
    onOpenClaim(firstClaimId, change.claim_ids ?? [])
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!hasClaims || !firstClaimId || !onOpenClaim) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpenClaim(firstClaimId, change.claim_ids ?? [])
    }
  }

  return (
    <div
      role={hasClaims ? 'button' : undefined}
      tabIndex={hasClaims ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'group relative flex flex-col space-y-3 rounded-2xl border border-border/80 bg-card p-5 transition-all text-left',
        hasClaims
          ? 'cursor-pointer hover:border-accent/50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
          : 'cursor-default',
        className,
      )}
    >
      {/* Top Header: Severity + Type + Product + Dimension + Relative Time */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityChip severity={change.severity} />
          <ChangeTypeChip type={change.change_type} />

          <div className="flex items-center gap-1.5 text-xs text-foreground font-semibold">
            <span>{productName}</span>
            <span className="text-muted-foreground">·</span>
            <span className="font-medium text-muted-foreground">{humanizeDimension(change.dimension)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <time
            dateTime={change.detected_at}
            title={new Date(change.detected_at).toLocaleString()}
            className="font-mono text-[11px] cursor-help underline decoration-dotted decoration-muted-foreground/60 underline-offset-2"
          >
            {formatRelativeTime(change.detected_at)}
          </time>
          {hasClaims && (
            <span
              className="inline-flex items-center gap-1 rounded bg-muted/70 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground group-hover:text-foreground"
              title="Click to view verified evidence in drawer"
            >
              <Sparkles className="h-2.5 w-2.5 text-accent" />
              <span>Evidence</span>
            </span>
          )}
        </div>
      </div>

      {/* Summary description */}
      <p className="text-sm font-medium leading-normal text-foreground group-hover:text-foreground/90">
        {change.summary}
      </p>

      {/* Diff Block */}
      <DiffBlock
        changeType={change.change_type}
        before={change.before}
        after={change.after}
      />

      {/* Bottom Footer: Source Link */}
      <div className="flex items-center justify-between pt-1 text-xs">
        <a
          href={change.source_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex max-w-[420px] items-center gap-1 truncate font-mono text-[11px] text-muted-foreground hover:text-accent transition-colors"
          title={`Open source: ${change.source_url}`}
        >
          <span className="truncate">{change.source_url}</span>
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>

        {change.claim_ids && change.claim_ids.length > 1 && (
          <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
            <Layers className="h-3 w-3" />
            <span>{change.claim_ids.length} claims</span>
          </span>
        )}
      </div>
    </div>
  )
}
