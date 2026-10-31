import * as React from 'react'
import Markdown, { type Components } from 'react-markdown'
import {
  AlertCircle,
  Bot,
  ExternalLink,
  RotateCcw,
  Sparkles,
  User,
} from 'lucide-react'
import type { Citation } from '@/api/types'
import { Button } from '@/components/ui/button'
import { CitationChip } from '@/components/CitationChip'
import { InsufficientEvidence } from '@/components/InsufficientEvidence'
import type { ChatTurn } from '@/hooks/useChat'
import { splitTextByCitations } from '@/lib/citations'
import { cn } from '@/lib/utils'

interface ChatMessageProps {
  message: ChatTurn
  onOpenClaim?: (claimId: string) => void
  onRetry?: (turnId: string) => void
  onSwitchToMatrix?: () => void
  onSuggestedQuery?: (q: string) => void
}

function extractHostname(url?: string | null): string {
  if (!url) return ''
  try {
    return new URL(url).hostname
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0] ?? ''
  }
}

function renderChildrenWithCitations(
  children: React.ReactNode,
  onOpenClaim?: (claimId: string) => void,
): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (typeof child === 'string') {
      const segments = splitTextByCitations(child)
      if (segments.length === 1 && segments[0]?.type === 'text') {
        return child
      }
      return segments.map((seg, idx) => {
        if (seg.type === 'citation' && seg.claimId) {
          return (
            <CitationChip
              key={idx}
              claimId={seg.claimId}
              onOpenClaim={onOpenClaim}
              className="mx-1 align-baseline inline-flex"
            />
          )
        }
        return <span key={idx}>{seg.content}</span>
      })
    }
    return child
  })
}

export function ChatMessage({
  message,
  onOpenClaim,
  onRetry,
  onSwitchToMatrix,
  onSuggestedQuery,
}: ChatMessageProps) {
  const isUser = message.role === 'user'

  // Deduplicate citations by claim_id
  const uniqueCitations = React.useMemo(() => {
    if (!message.citations) return []
    const seen = new Set<string>()
    const list: Citation[] = []
    for (const c of message.citations) {
      if (!seen.has(c.claim_id)) {
        seen.add(c.claim_id)
        list.push(c)
      }
    }
    return list
  }, [message.citations])

  const markdownComponents: Partial<Components> = React.useMemo(
    () => ({
      p: ({ children }) => (
        <p className="mb-2 last:mb-0 text-sm leading-relaxed text-foreground">
          {renderChildrenWithCitations(children, onOpenClaim)}
        </p>
      ),
      li: ({ children }) => (
        <li className="mb-1 text-sm leading-relaxed text-foreground">
          {renderChildrenWithCitations(children, onOpenClaim)}
        </li>
      ),
      code: ({ children, className }) => (
        <code className={cn('rounded bg-muted px-1.5 py-0.5 font-mono text-xs', className)}>
          {children}
        </code>
      ),
    }),
    [onOpenClaim],
  )

  // 1. User Message Bubble
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="flex items-start gap-2.5 max-w-[85%] sm:max-w-[75%]">
          <div className="rounded-2xl rounded-tr-xs bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-2xs">
            <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
          </div>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <User className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>
    )
  }

  // 2. Pending Assistant Response (Typing dots)
  if (message.isPending) {
    return (
      <div className="flex justify-start">
        <div className="flex items-start gap-2.5 max-w-[85%] sm:max-w-[75%]">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
            <Bot className="h-3.5 w-3.5" />
          </div>
          <div className="rounded-2xl rounded-tl-xs border border-border bg-card px-4 py-3 shadow-2xs flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent/60 animate-bounce [animation-delay:-0.3s]" />
            <span className="h-2 w-2 rounded-full bg-accent/60 animate-bounce [animation-delay:-0.15s]" />
            <span className="h-2 w-2 rounded-full bg-accent/60 animate-bounce" />
          </div>
        </div>
      </div>
    )
  }

  // 3. Error Assistant Turn
  if (message.isError) {
    return (
      <div className="flex justify-start">
        <div className="flex items-start gap-2.5 max-w-[85%] sm:max-w-[75%]">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
            <AlertCircle className="h-3.5 w-3.5" />
          </div>
          <div className="rounded-2xl rounded-tl-xs border border-danger/30 bg-danger-soft p-4 shadow-2xs space-y-2.5 text-left text-xs text-danger">
            <div className="flex items-center gap-2">
              <span className="font-semibold">Query failed:</span>
              <span>{message.errorMessage || 'Unable to retrieve model response.'}</span>
            </div>
            {onRetry && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onRetry(message.id)}
                className="h-7 text-xs border-danger/40 text-danger hover:bg-danger/10 gap-1.5"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Retry question</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // 4. Insufficient Evidence State
  if (message.insufficient_evidence) {
    return (
      <div className="flex justify-start">
        <div className="flex items-start gap-2.5 max-w-[90%] sm:max-w-[80%]">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
            <Bot className="h-3.5 w-3.5" />
          </div>
          <div className="flex-1">
            <InsufficientEvidence
              answer={message.content}
              onSwitchToMatrix={onSwitchToMatrix}
              onSuggestedQuery={onSuggestedQuery}
            />
          </div>
        </div>
      </div>
    )
  }

  // 5. Standard Answer Bubble with Verified Citations
  return (
    <div className="flex justify-start">
      <div className="flex items-start gap-2.5 max-w-[90%] sm:max-w-[80%]">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
          <Bot className="h-3.5 w-3.5" />
        </div>

        <div className="space-y-3 rounded-2xl rounded-tl-xs border border-border bg-card p-4 shadow-2xs text-left">
          {/* Answer Text */}
          <div className="text-sm leading-relaxed text-foreground">
            <Markdown components={markdownComponents}>{message.content}</Markdown>
          </div>

          {/* Sources Section */}
          {uniqueCitations.length > 0 ? (
            <div className="space-y-1.5 pt-2 border-t border-border/50">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <Sparkles className="h-3 w-3 text-accent" />
                <span>Cited Sources</span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {uniqueCitations.map((c) => {
                  const host = extractHostname(c.source_url)
                  return (
                    <button
                      key={c.claim_id}
                      type="button"
                      onClick={() => onOpenClaim?.(c.claim_id)}
                      title={c.quote || c.claim_id}
                      className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2 py-1 text-left text-xs transition-colors hover:border-accent hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <ExternalLink className="h-3 w-3 text-accent shrink-0" />
                      <span className="font-mono font-semibold text-foreground text-[11px]">
                        {c.claim_id}
                      </span>
                      {c.quote && (
                        <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[220px]">
                          "{c.quote}"
                        </span>
                      )}
                      {host && (
                        <span className="rounded bg-muted px-1.5 py-0.2 font-mono text-[9px] text-muted-foreground border border-border/60">
                          {host}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="pt-2 border-t border-border/40 text-[11px] italic text-muted-foreground">
              No citations attached.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
