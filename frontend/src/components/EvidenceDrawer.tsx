import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  RotateCcw,
  ShieldCheck,
  Tag,
  X,
} from 'lucide-react'
import { api } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SnapshotViewer } from '@/components/SnapshotViewer'
import { StatusIcon } from '@/components/StatusIcon'
import { useEvidenceDrawer } from '@/hooks/useEvidenceDrawer'
import { formatRelativeTime, humanizeDimension } from '@/lib/format'
import { cn } from '@/lib/utils'

export function EvidenceDrawer() {
  const { claimId, relatedClaimIds, isOpen, openClaim, closeClaim } = useEvidenceDrawer()
  const previousFocusRef = React.useRef<HTMLElement | null>(null)
  const drawerRef = React.useRef<HTMLDivElement | null>(null)

  // Track expanded snapshot viewers by evidence ID
  const [expandedSnapshots, setExpandedSnapshots] = React.useState<Record<string, boolean>>({})

  // Fetch claim details
  const { data: claim, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['claim', claimId],
    queryFn: () => api.getClaim(claimId!),
    enabled: Boolean(claimId),
  })

  // Expand first evidence item by default when claim loads
  React.useEffect(() => {
    if (claim?.evidence?.[0]?.id) {
      setExpandedSnapshots({ [claim.evidence[0].id]: true })
    }
  }, [claim?.id, claim?.evidence])

  // Focus trap & return focus
  React.useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement
      // Focus drawer container
      window.setTimeout(() => {
        drawerRef.current?.focus()
      }, 50)
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus()
      previousFocusRef.current = null
    }
  }, [isOpen])

  // Handle ESC key and focus trapping
  React.useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeClaim()
        return
      }

      if (e.key === 'Tab' && drawerRef.current) {
        const focusables = drawerRef.current.querySelectorAll<HTMLElement>(
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
  }, [isOpen, closeClaim])

  if (!isOpen) return null

  const toggleSnapshot = (evidenceId: string) => {
    setExpandedSnapshots((prev) => ({
      ...prev,
      [evidenceId]: !prev[evidenceId],
    }))
  }

  const confidence = claim?.verification.confidence ?? 0
  const confidencePct = Math.round(confidence * 100)

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="evidence-drawer-title">
      {/* Backdrop */}
      <div
        onClick={closeClaim}
        className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        <div
          ref={drawerRef}
          tabIndex={-1}
          className="w-screen max-w-md sm:max-w-xl md:max-w-[540px] transform bg-card shadow-2xl transition-all animate-slide-in-right flex flex-col focus-visible:outline-none border-l border-border"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/80 px-6 py-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-accent" />
                <h2 id="evidence-drawer-title" className="text-base font-semibold tracking-tight text-foreground">
                  Verified Evidence
                </h2>
              </div>
              <p className="font-mono text-xs text-muted-foreground">{claimId}</p>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={closeClaim}
              className="rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close evidence drawer"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Claim Switcher if multiple claim IDs exist */}
          {relatedClaimIds.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border/60 bg-muted/40 px-6 py-2.5">
              <span className="text-[11px] font-medium text-muted-foreground shrink-0">Related claims:</span>
              <div className="flex items-center gap-1.5">
                {relatedClaimIds.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => openClaim(id, relatedClaimIds)}
                    className={cn(
                      'rounded-full px-2.5 py-0.5 font-mono text-xs transition-colors',
                      id === claimId
                        ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                        : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground border border-border',
                    )}
                  >
                    {id}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {isLoading && (
              <div className="space-y-4">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-28 w-full rounded-xl" />
                <Skeleton className="h-40 w-full rounded-xl" />
              </div>
            )}

            {isError && (
              <div className="rounded-2xl border border-danger/30 bg-danger-soft p-5 text-sm text-danger">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span className="font-semibold">Unable to load claim details</span>
                </div>
                <p className="mt-1 text-xs text-danger/80">{error?.message || 'Claim record not found'}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void refetch()}
                  className="mt-4 border-danger/30 text-danger hover:bg-danger/10 text-xs"
                >
                  <RotateCcw className="h-3 w-3" />
                  Retry
                </Button>
              </div>
            )}

            {claim && (
              <>
                {/* Statement */}
                <div className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Extracted Claim Statement
                  </span>
                  <p className="text-base font-medium leading-snug text-foreground">
                    "{claim.statement}"
                  </p>
                </div>

                {/* Metadata Tags */}
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="gap-1 font-normal">
                    <Tag className="h-3 w-3 text-muted-foreground" />
                    <span>{humanizeDimension(claim.dimension)}</span>
                  </Badge>
                  <Badge variant="outline" className="font-mono text-xs">
                    Product: {claim.product_id}
                  </Badge>
                </div>

                {/* Verification Card with Confidence Bar */}
                <div className="rounded-2xl border border-border bg-card p-4 space-y-3.5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">Verification Audit</span>
                    <StatusIcon status={claim.verification.status} />
                  </div>

                  {/* Confidence Bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Verification Confidence</span>
                      <span className="font-mono font-semibold text-foreground">{confidencePct}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-300',
                          confidence >= 0.85
                            ? 'bg-success'
                            : confidence >= 0.6
                              ? 'bg-warning'
                              : 'bg-danger',
                        )}
                        style={{ width: `${confidencePct}%` }}
                      />
                    </div>
                  </div>

                  {/* Reason Text */}
                  {claim.verification.reason && (
                    <div className="rounded-lg bg-muted/50 p-2.5 text-xs text-foreground/90">
                      <span className="font-semibold text-foreground">Reason: </span>
                      <span>{claim.verification.reason}</span>
                    </div>
                  )}
                </div>

                {/* Timestamps */}
                {(claim.first_seen_at || claim.last_seen_at) && (
                  <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground border-y border-border/60 py-2.5">
                    {claim.first_seen_at && (
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>First seen: {formatRelativeTime(claim.first_seen_at)}</span>
                      </div>
                    )}
                    {claim.last_seen_at && (
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        <span>Last verified: {formatRelativeTime(claim.last_seen_at)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Evidence Items Section */}
                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Evidence Sources ({claim.evidence.length})
                    </h3>
                  </div>

                  <div className="space-y-4">
                    {claim.evidence.map((item, idx) => {
                      const isExpanded = Boolean(expandedSnapshots[item.id])
                      return (
                        <div
                          key={item.id}
                          className="rounded-2xl border border-border bg-card p-4 space-y-3 shadow-xs"
                        >
                          {/* Evidence Top */}
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] font-semibold text-foreground">
                              Evidence #{idx + 1}
                            </span>
                            <div className="flex items-center gap-2">
                              {item.source_type && (
                                <Badge variant="secondary" className="text-[10px] font-mono">
                                  {item.source_type}
                                </Badge>
                              )}
                              <span className="text-[11px] text-muted-foreground">
                                {formatRelativeTime(item.captured_at)}
                              </span>
                            </div>
                          </div>

                          {/* Quote */}
                          <blockquote className="border-l-2 border-accent/60 pl-3 font-mono text-xs leading-relaxed text-foreground bg-muted/30 py-1.5 rounded-r">
                            "{item.quote}"
                          </blockquote>

                          {/* Source Link */}
                          <div className="flex items-center justify-between pt-1 text-xs">
                            <a
                              href={item.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex max-w-[340px] items-center gap-1 truncate text-accent hover:underline font-mono text-[11px]"
                            >
                              <span className="truncate">{item.source_url}</span>
                              <ExternalLink className="h-3 w-3 shrink-0" />
                            </a>

                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleSnapshot(item.id)}
                              className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
                            >
                              <span>{isExpanded ? 'Hide snapshot' : 'View snapshot'}</span>
                              {isExpanded ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>

                          {/* Expandable Snapshot Viewer */}
                          {isExpanded && (
                            <div className="pt-2">
                              <SnapshotViewer
                                snapshotId={item.snapshot_id}
                                quote={item.quote}
                                charStart={item.char_start}
                                charEnd={item.char_end}
                              />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
