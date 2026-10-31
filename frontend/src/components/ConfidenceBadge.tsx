import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface ConfidenceBadgeProps {
  confidence: number
  isMissing?: boolean
  className?: string
}

export function ConfidenceBadge({ confidence, isMissing, className }: ConfidenceBadgeProps) {
  if (isMissing || confidence <= 0) {
    return (
      <Badge variant="secondary" className={cn('text-[11px] font-normal text-muted-foreground', className)}>
        <span>—</span>
      </Badge>
    )
  }

  const pct = Math.round(confidence * 100)

  if (confidence >= 0.85) {
    return (
      <Badge variant="success" className={cn('text-[11px] font-medium', className)} title={`${pct}% confidence`}>
        <span className="h-1.5 w-1.5 rounded-full bg-success" />
        <span>High ({pct}%)</span>
      </Badge>
    )
  }

  if (confidence >= 0.6) {
    return (
      <Badge variant="warning" className={cn('text-[11px] font-medium', className)} title={`${pct}% confidence`}>
        <span className="h-1.5 w-1.5 rounded-full bg-warning" />
        <span>Medium ({pct}%)</span>
      </Badge>
    )
  }

  return (
    <Badge variant="danger" className={cn('text-[11px] font-medium', className)} title={`${pct}% confidence`}>
      <span className="h-1.5 w-1.5 rounded-full bg-danger" />
      <span>Low ({pct}%)</span>
    </Badge>
  )
}
