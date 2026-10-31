import type { Gap } from '@/api/types'
import { CitationChip } from '@/components/CitationChip'
import { SeverityChip } from '@/components/SeverityChip'
import { humanizeDimension } from '@/lib/format'
import { cn } from '@/lib/utils'

interface GapCardProps {
  gap: Gap
  onOpenClaim?: (claimId: string) => void
  className?: string
}

export function GapCard({ gap, onOpenClaim, className }: GapCardProps) {
  return (
    <div
      className={cn(
        'flex flex-col justify-between space-y-3 rounded-2xl border border-border/80 bg-card p-5 shadow-xs transition-colors hover:border-border',
        className,
      )}
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
          <span className="text-xs font-semibold text-foreground">
            {humanizeDimension(gap.dimension)}
          </span>
          <SeverityChip severity={gap.severity} />
        </div>

        <p className="text-sm font-normal leading-relaxed text-foreground/90">
          {gap.description}
        </p>
      </div>

      {gap.claim_ids && gap.claim_ids.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/40">
          <span className="text-[11px] font-medium text-muted-foreground mr-1">Cited evidence:</span>
          {gap.claim_ids.map((cid) => (
            <CitationChip key={cid} claimId={cid} onOpenClaim={onOpenClaim} />
          ))}
        </div>
      )}
    </div>
  )
}
