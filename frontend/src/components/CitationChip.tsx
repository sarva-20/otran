import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, FileText, HelpCircle } from 'lucide-react'
import { api } from '@/api/client'
import { cn } from '@/lib/utils'

interface CitationChipProps {
  claimId: string
  onOpenClaim?: (claimId: string) => void
  className?: string
}

export function CitationChip({ claimId, onOpenClaim, className }: CitationChipProps) {
  // Use cached claim query without per-chip loading flicker
  const { data: claim } = useQuery({
    queryKey: ['claim', claimId],
    queryFn: () => api.getClaim(claimId),
    staleTime: 300_000,
    gcTime: 600_000,
  })

  const status = claim?.verification.status ?? 'verified'
  const statusLabel =
    status === 'contradicted'
      ? 'Contradicted'
      : status === 'unverified'
        ? 'Unverified'
        : 'Verified'

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onOpenClaim?.(claimId)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
      onOpenClaim?.(claimId)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      title={`View evidence for ${claimId} (${statusLabel})`}
      aria-label={`View evidence for claim ${claimId}, verification status: ${statusLabel}`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition-all hover:border-accent hover:text-foreground hover:shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        className,
      )}
    >
      <FileText className="h-3 w-3 text-accent shrink-0" />
      <span className="font-semibold text-foreground">{claimId}</span>

      {/* Verification status indicator (icon + aria-label) */}
      {status === 'verified' && (
        <span className="inline-flex items-center text-success" title="Verified">
          <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
        </span>
      )}
      {status === 'contradicted' && (
        <span className="inline-flex items-center text-warning" title="Contradicted">
          <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
        </span>
      )}
      {status === 'unverified' && (
        <span className="inline-flex items-center text-muted-foreground" title="Unverified">
          <HelpCircle className="h-2.5 w-2.5 shrink-0" />
        </span>
      )}

      {claim?.dimension && (
        <span className="font-sans text-[10px] text-muted-foreground/80 truncate max-w-[80px]">
          {claim.dimension}
        </span>
      )}
    </button>
  )
}
