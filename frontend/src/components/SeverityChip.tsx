import { AlertCircle, AlertTriangle, Info } from 'lucide-react'
import type { Severity } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface SeverityChipProps {
  severity: Severity
  className?: string
}

export function SeverityChip({ severity, className }: SeverityChipProps) {
  switch (severity) {
    case 'high':
      return (
        <Badge variant="danger" className={cn('text-[11px] font-semibold gap-1', className)}>
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span>High Severity</span>
        </Badge>
      )
    case 'medium':
      return (
        <Badge variant="warning" className={cn('text-[11px] font-semibold gap-1', className)}>
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>Medium</span>
        </Badge>
      )
    case 'low':
    default:
      return (
        <Badge variant="secondary" className={cn('text-[11px] font-medium gap-1 text-muted-foreground', className)}>
          <Info className="h-3 w-3 shrink-0" />
          <span>Low</span>
        </Badge>
      )
  }
}
