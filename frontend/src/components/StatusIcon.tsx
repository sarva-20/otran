import { AlertTriangle, CheckCircle2, HelpCircle, MinusCircle } from 'lucide-react'
import type { CellStatus } from '@/api/types'
import { cn } from '@/lib/utils'

interface StatusIconProps {
  status: CellStatus
  className?: string
  showText?: boolean
}

export function StatusIcon({ status, className, showText = true }: StatusIconProps) {
  switch (status) {
    case 'verified':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1 text-xs font-medium text-success',
            className,
          )}
          title="Verified against primary evidence"
        >
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          {showText && <span>Verified</span>}
        </span>
      )
    case 'unverified':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1 text-xs font-medium text-muted-foreground',
            className,
          )}
          title="Unverified single-source claim"
        >
          <HelpCircle className="h-3.5 w-3.5 shrink-0" />
          {showText && <span>Unverified</span>}
        </span>
      )
    case 'contradicted':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1 text-xs font-medium text-warning',
            className,
          )}
          title="Contradicted: sources disagree"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {showText && <span>Contradicted</span>}
        </span>
      )
    case 'missing':
    default:
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1 text-xs font-normal text-muted-foreground/70',
            className,
          )}
          title="No public evidence found"
        >
          <MinusCircle className="h-3.5 w-3.5 shrink-0" />
          {showText && <span>Missing</span>}
        </span>
      )
  }
}
