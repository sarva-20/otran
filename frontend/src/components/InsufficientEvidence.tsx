import { AlertTriangle, Grid, HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface InsufficientEvidenceProps {
  answer: string
  onSwitchToMatrix?: () => void
  onSuggestedQuery?: (q: string) => void
  className?: string
}

export function InsufficientEvidence({
  answer,
  onSwitchToMatrix,
  onSuggestedQuery,
  className,
}: InsufficientEvidenceProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-warning/40 bg-card p-5 space-y-3.5 shadow-2xs text-left',
        className,
      )}
    >
      {/* Header with icon and distinct non-error notice */}
      <div className="flex items-center gap-2 text-warning">
        <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
        <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
          Not Enough Verified Evidence
        </span>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        Our intelligence agents answer questions strictly backed by captured page snapshots.
        No verified claims in the current database sufficiently support this query.
      </p>

      {/* Answer text from model rendered in muted style */}
      {answer && (
        <div className="rounded-xl border border-border/70 bg-muted/40 p-3 font-mono text-xs text-muted-foreground/90 italic">
          "{answer}"
        </div>
      )}

      {/* Actionable suggestions */}
      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/50 text-xs">
        <span className="text-muted-foreground text-[11px] font-medium flex items-center gap-1">
          <HelpCircle className="h-3 w-3" />
          <span>Suggestions:</span>
        </span>

        {onSuggestedQuery && (
          <>
            <button
              type="button"
              onClick={() => onSuggestedQuery('Who undercut our pricing recently?')}
              className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] text-muted-foreground hover:border-accent hover:text-foreground transition-colors"
            >
              Ask about pricing
            </button>
            <button
              type="button"
              onClick={() => onSuggestedQuery('Which competitor ships fastest?')}
              className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] text-muted-foreground hover:border-accent hover:text-foreground transition-colors"
            >
              Ask about shipping speed
            </button>
          </>
        )}

        {onSwitchToMatrix && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSwitchToMatrix}
            className="h-7 px-2.5 text-[11px] gap-1 ml-auto text-accent border-accent/30 hover:bg-accent/10"
          >
            <Grid className="h-3 w-3" />
            <span>Open Comparison Matrix</span>
          </Button>
        )}
      </div>
    </div>
  )
}
