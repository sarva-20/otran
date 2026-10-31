import * as React from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import type { AgentEvent, Product } from '@/api/types'
import { getAgentConfig } from '@/lib/colors'
import { formatRelativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'

interface EventRowProps {
  event: AgentEvent
  products?: Product[]
  animate?: boolean
}

function useLiveRelativeTime(timestamp: string): string {
  const [relTime, setRelTime] = React.useState(() => formatRelativeTime(timestamp))
  React.useEffect(() => {
    setRelTime(formatRelativeTime(timestamp))
    const timer = setInterval(() => {
      setRelTime(formatRelativeTime(timestamp))
    }, 10000)
    return () => clearInterval(timer)
  }, [timestamp])
  return relTime
}

function LevelBadge({ level }: { level: AgentEvent['level'] }) {
  switch (level) {
    case 'success':
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">
          <CheckCircle2 className="h-3 w-3 shrink-0" />
          <span>Success</span>
        </span>
      )
    case 'warning':
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>Warning</span>
        </span>
      )
    case 'error':
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-danger/30 bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger">
          <XCircle className="h-3 w-3 shrink-0" />
          <span>Error</span>
        </span>
      )
    case 'info':
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          <Info className="h-3 w-3 shrink-0" />
          <span>Info</span>
        </span>
      )
  }
}

export function EventRow({ event, products = [], animate = true }: EventRowProps) {
  const agentCfg = getAgentConfig(event.agent)
  const IconComponent = agentCfg.icon
  const relativeTime = useLiveRelativeTime(event.ts)
  const product = event.product_id ? products.find((p) => p.id === event.product_id) : undefined

  const data = event.data
  const hasData =
    Boolean(data) &&
    (data?.url !== undefined || data?.claim_id !== undefined || data?.count !== undefined)

  return (
    <div
      className={cn(
        'group flex flex-col gap-2 rounded-xl border border-border/80 bg-card p-4 transition-colors hover:border-border',
        animate && 'animate-row-in',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Left: Agent badge + step + product */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Agent badge */}
          <div
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
              agentCfg.badgeClass,
            )}
          >
            <IconComponent className={cn('h-3.5 w-3.5', agentCfg.iconClass)} />
            <span>{agentCfg.label}</span>
          </div>

          {/* Step */}
          {event.step && (
            <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
              {event.step}
            </span>
          )}

          {/* Target Product */}
          {product && (
            <span className="rounded border border-border/70 bg-card px-2 py-0.5 text-[11px] font-medium text-foreground">
              {product.name}
            </span>
          )}
        </div>

        {/* Right: Level badge + relative time */}
        <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
          <LevelBadge level={event.level} />
          <span className="font-mono text-[11px] text-muted-foreground/80">{relativeTime}</span>
        </div>
      </div>

      {/* Message */}
      <p className="text-sm font-normal text-foreground">{event.message}</p>

      {/* Structured data chips */}
      {data && hasData && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {typeof data.url === 'string' && (
            <span className="inline-flex items-center rounded border border-border bg-muted/70 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
              <span className="text-foreground/70">url:</span>&nbsp;
              <span className="max-w-[340px] truncate text-foreground" title={data.url}>
                {data.url}
              </span>
            </span>
          )}
          {typeof data.claim_id === 'string' && (
            <span className="inline-flex items-center rounded border border-border bg-muted/70 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
              <span className="text-foreground/70">claim:</span>&nbsp;
              <span className="text-foreground">{data.claim_id}</span>
            </span>
          )}
          {(typeof data.count === 'number' || typeof data.count === 'string') && (
            <span className="inline-flex items-center rounded border border-border bg-muted/70 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
              <span className="text-foreground/70">count:</span>&nbsp;
              <span className="text-foreground">{String(data.count)}</span>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
