import * as React from 'react'
import {
  ArrowDown,
  Clock,
  MessageSquare,
  Sparkles,
  Zap,
} from 'lucide-react'
import type { Analysis } from '@/api/types'
import { ChatInput } from '@/components/ChatInput'
import { ChatMessage } from '@/components/ChatMessage'
import type { ChatTurn } from '@/hooks/useChat'
import { cn } from '@/lib/utils'

interface ChatPanelProps {
  analysis: Analysis
  messages: ChatTurn[]
  onSendMessage: (question: string) => void
  onRetryTurn?: (turnId: string) => void
  onOpenClaim?: (claimId: string) => void
  onSwitchToMatrix?: () => void
  isPending?: boolean
  className?: string
}

const SUGGESTED_QUESTIONS = [
  'Who undercut our pricing recently?',
  'Which competitor ships fastest?',
  'Where do sources disagree?',
  'What do we lead on?',
]

export function ChatPanel({
  analysis,
  messages,
  onSendMessage,
  onRetryTurn,
  onOpenClaim,
  onSwitchToMatrix,
  isPending = false,
  className,
}: ChatPanelProps) {
  const isRunning = analysis.status === 'queued' || analysis.status === 'running'
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const [isAtBottom, setIsAtBottom] = React.useState(true)

  const handleScroll = React.useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setIsAtBottom(distanceFromBottom <= 50)
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
      scrollToBottom(true)
    }
  }, [messages.length, isAtBottom, scrollToBottom])

  // 1. Run in flight state
  if (isRunning) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/60 p-16 text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Clock className="h-5 w-5 text-muted-foreground" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">Chat is available when the analysis completes</h3>
        <p className="mt-1.5 max-w-sm text-xs text-muted-foreground leading-relaxed">
          The Q&A agent answers questions strictly using verified claims and immutable snapshots.
          Chat unlocks once the pipeline agents finish.
        </p>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-2xl border border-border bg-card shadow-sm h-[680px]',
        className,
      )}
    >
      {/* Messages Scroll Area */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        aria-live="polite"
        className="flex-1 overflow-y-auto p-6 space-y-5"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 text-center max-w-md mx-auto space-y-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
              <MessageSquare className="h-6 w-6" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-semibold text-foreground">
                Cited Competitive Intelligence Chat
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Ask questions about your product and competitors. Every response is grounded in verified claims with source citations.
              </p>
            </div>

            {/* Suggested prompts */}
            <div className="w-full space-y-2 pt-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider justify-center">
                <Sparkles className="h-3 w-3 text-accent" />
                <span>Suggested Questions</span>
              </div>

              <div className="grid gap-2 text-left">
                {SUGGESTED_QUESTIONS.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => onSendMessage(question)}
                    disabled={isPending}
                    className="flex items-center justify-between rounded-xl border border-border/80 bg-background/60 p-3 text-xs text-foreground transition-all hover:border-accent/40 hover:bg-muted/40 hover:shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span>{question}</span>
                    <Zap className="h-3 w-3 text-accent shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              onOpenClaim={onOpenClaim}
              onRetry={onRetryTurn}
              onSwitchToMatrix={onSwitchToMatrix}
              onSuggestedQuery={onSendMessage}
            />
          ))
        )}
      </div>

      {/* "Jump to latest" floating pill */}
      {!isAtBottom && messages.length > 0 && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full border border-border bg-card/95 px-3 py-1.5 text-xs font-medium text-foreground shadow-lg backdrop-blur transition-all hover:bg-card hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowDown className="h-3.5 w-3.5 text-accent" />
          <span>Jump to latest</span>
        </button>
      )}

      {/* Input Form at Bottom */}
      <div className="border-t border-border/80 bg-card p-4 rounded-b-2xl">
        <ChatInput
          onSend={onSendMessage}
          disabled={isRunning}
          isPending={isPending}
        />
      </div>
    </div>
  )
}
