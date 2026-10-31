import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, AlertTriangle, FileText, Hash, Loader2, RotateCcw } from 'lucide-react'
import { api } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatRelativeTime } from '@/lib/format'

interface SnapshotViewerProps {
  snapshotId: string
  quote: string
  charStart?: number | null
  charEnd?: number | null
}

export function SnapshotViewer({
  snapshotId,
  quote,
  charStart,
  charEnd,
}: SnapshotViewerProps) {
  const highlightRef = React.useRef<HTMLElement | null>(null)

  const { data: snapshot, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['snapshot', snapshotId],
    queryFn: () => api.getSnapshot(snapshotId),
    enabled: Boolean(snapshotId),
  })

  // Calculate highlight offsets and fallback search if offsets differ
  const { prefix, match, suffix, fallbackUsed, notFound } = React.useMemo(() => {
    if (!snapshot || !snapshot.text) {
      return { prefix: '', match: '', suffix: '', fallbackUsed: false, notFound: false }
    }

    const text = snapshot.text
    const trimmedQuote = quote.trim()

    // 1. Try exact offsets if provided
    if (
      charStart !== null &&
      charStart !== undefined &&
      charEnd !== null &&
      charEnd !== undefined &&
      charStart >= 0 &&
      charEnd <= text.length &&
      charStart < charEnd
    ) {
      const slice = text.slice(charStart, charEnd)
      if (slice === quote || slice.trim() === trimmedQuote) {
        return {
          prefix: text.slice(0, charStart),
          match: slice,
          suffix: text.slice(charEnd),
          fallbackUsed: false,
          notFound: false,
        }
      }
    }

    // 2. Fallback search: verbatim substring search
    const verbatimIndex = text.indexOf(quote)
    if (verbatimIndex !== -1) {
      return {
        prefix: text.slice(0, verbatimIndex),
        match: text.slice(verbatimIndex, verbatimIndex + quote.length),
        suffix: text.slice(verbatimIndex + quote.length),
        fallbackUsed: true,
        notFound: false,
      }
    }

    // 3. Fallback search: case-insensitive
    const lowerText = text.toLowerCase()
    const lowerQuote = quote.toLowerCase()
    const ciIndex = lowerText.indexOf(lowerQuote)
    if (ciIndex !== -1) {
      return {
        prefix: text.slice(0, ciIndex),
        match: text.slice(ciIndex, ciIndex + quote.length),
        suffix: text.slice(ciIndex + quote.length),
        fallbackUsed: true,
        notFound: false,
      }
    }

    // Not found
    return {
      prefix: text,
      match: '',
      suffix: '',
      fallbackUsed: false,
      notFound: true,
    }
  }, [snapshot, quote, charStart, charEnd])

  // Auto-scroll to highlight on render
  React.useEffect(() => {
    if (match && highlightRef.current) {
      const timer = setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [match])

  if (isLoading) {
    return (
      <div className="space-y-2 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Fetching immutable snapshot {snapshotId}…</span>
        </div>
        <Skeleton className="h-36 w-full rounded-lg" />
      </div>
    )
  }

  if (isError || !snapshot) {
    return (
      <div className="rounded-xl border border-danger/30 bg-danger-soft p-4 text-xs text-danger">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Failed to load snapshot {snapshotId}: {error?.message || 'Snapshot not found'}</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void refetch()}
            className="h-7 text-xs border-danger/30 text-danger hover:bg-danger/10"
          >
            <RotateCcw className="h-3 w-3" />
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-4 shadow-sm">
      {/* Header metadata */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5 font-mono">
          <FileText className="h-3.5 w-3.5 text-accent" />
          <span className="font-semibold text-foreground">{snapshot.id}</span>
          <span>·</span>
          <span>{snapshot.source_type || 'web page'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span>{formatRelativeTime(snapshot.captured_at)}</span>
          <span>·</span>
          <span className="inline-flex items-center gap-1 font-mono text-[10px]" title={snapshot.content_hash}>
            <Hash className="h-3 w-3" />
            <span className="max-w-[120px] truncate">{snapshot.content_hash}</span>
          </span>
        </div>
      </div>

      {/* Fallback Notice */}
      {fallbackUsed && (
        <div className="flex items-center gap-1.5 rounded-lg border border-warning/30 bg-warning-soft px-3 py-1.5 text-xs text-warning">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>Character offsets differed; quote verified via verbatim text search.</span>
        </div>
      )}

      {notFound && (
        <div className="flex items-center gap-1.5 rounded-lg border border-warning/30 bg-warning-soft px-3 py-1.5 text-xs text-warning">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>Exact quote text could not be isolated in snapshot text.</span>
        </div>
      )}

      {/* Snapshot Content with Highlight */}
      <div className="max-h-64 overflow-y-auto rounded-lg border border-border/70 bg-muted/40 p-3 font-mono text-xs leading-relaxed text-foreground whitespace-pre-wrap select-text">
        {match ? (
          <>
            <span>{prefix}</span>
            <mark
              ref={highlightRef}
              className="rounded bg-yellow-200 text-foreground dark:bg-yellow-900/70 dark:text-yellow-100 font-semibold px-1 py-0.5 ring-2 ring-yellow-400"
            >
              {match}
            </mark>
            <span>{suffix}</span>
          </>
        ) : (
          <span>{snapshot.text}</span>
        )}
      </div>
    </div>
  )
}
