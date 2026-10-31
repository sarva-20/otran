import * as React from 'react'
import {
  AlertCircle,
  ArrowDown,
  CheckCircle2,
  Clock,
  Loader2,
  RotateCcw,
  XCircle,
} from 'lucide-react'
import type { AgentEvent, Product } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EventRow } from '@/components/EventRow'
import type { StreamStatus } from '@/hooks/useEventStream'
import { cn } from '@/lib/utils'

interface AgentTraceProps {
  events: AgentEvent[]
  status: StreamStatus
  retrying: boolean
  retry: () => void
  products?: Product[]
  isInitialCompleted?: boolean
  className?: string
}

export function AgentTrace({
  events,
  status,
  retrying,
  retry,
  products = [],
  isInitialCompleted = false,
  className,
}: AgentTraceProps) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = React.useState(true)

  const handleScroll = React.useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setIsAtBottom(distanceFromBottom <= 40)
  }, [])

  const scrollToBottom = React.useCallback((smooth = true) => {
    const el = containerRef.current
    if (!el) return
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    })
    setIsAtBottom(true)
  }, [])

  React.useEffect(() => {
    if (isAtBottom) {
      scrollToBottom(!isInitialCompleted)
    }
  }, [events.length, isAtBottom, isInitialCompleted, scrollToBottom])

  const isLoading = status === 'connecting' && events.length === 0

  return (
    <div className={cn('relative flex flex-col', className)}>
      {/* Reconnecting alert banner */}
      {retrying && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Connection interrupted. Reconnecting to agent event stream…</span>
        </div>
      )}

      {/* Stream Error notice with Retry */}
      {status === 'error' && (
        <div
          className="mb-3 flex items-center justify-between rounded-xl border border-danger/30 bg-danger-soft p-3.5 text-sm text-danger"
          role="alert"
        >
          <div className="flex items-center gap-2 text-xs">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Live stream disconnected. Background polling remains active.</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={retry}
            className="h-7 border-danger/30 text-xs text-danger hover:bg-danger-soft"
          >
            <RotateCcw className="h-3 w-3" />
            Retry stream
          </Button>
        </div>
      )}

      {/* Completion Banner */}
      {status === 'done' && (
        <div
          className="mb-3 flex items-center gap-2 rounded-xl border border-success/30 bg-success-soft p-3 text-xs font-medium text-success"
          role="status"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>All pipeline agents completed successfully. Evidence and comparison matrix are ready.</span>
        </div>
      )}

      {/* Failure Banner */}
      {status === 'failed' && (
        <div
          className="mb-3 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger-soft p-3 text-xs font-medium text-danger"
          role="alert"
        >
          <XCircle className="h-4 w-4 shrink-0" />
          <span>Analysis ended with errors. Inspect the event log below for details.</span>
        </div>
      )}

      {/* Scrollable Event Feed Container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="max-h-[640px] space-y-3 overflow-y-auto rounded-2xl border border-border bg-background/50 p-4"
        tabIndex={0}
        aria-label="Agent trace events feed"
        aria-live="polite"
        aria-atomic="false"
      >
        {isLoading && (
          <div className="space-y-3" role="status" aria-label="Connecting to agent stream">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-24 rounded-full" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-4 w-2/3" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && events.length === 0 && status !== 'error' && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="relative mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-accent/10">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-40" />
              <Clock className="h-4 w-4 text-accent" />
            </div>
            <p className="text-sm font-medium text-foreground">Waiting for agents…</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Discovery and collection agents will begin streaming events shortly.
            </p>
          </div>
        )}

        {!isLoading &&
          events.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              products={products}
              animate={!isInitialCompleted}
            />
          ))}
      </div>

      {/* "Jump to latest" floating pill */}
      {!isAtBottom && events.length > 0 && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full border border-border bg-card/95 px-3 py-1.5 text-xs font-medium text-foreground shadow-lg backdrop-blur transition-all hover:bg-card hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowDown className="h-3.5 w-3.5 text-accent" />
          <span>Jump to latest</span>
        </button>
      )}
    </div>
  )
}
