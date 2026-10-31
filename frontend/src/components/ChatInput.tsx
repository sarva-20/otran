import * as React from 'react'
import { ArrowUp, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
  isPending?: boolean
  placeholder?: string
  className?: string
}

export function ChatInput({
  onSend,
  disabled = false,
  isPending = false,
  placeholder = 'Ask a question about pricing, claims, or features…',
  className,
}: ChatInputProps) {
  const [value, setValue] = React.useState('')
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!value.trim() || disabled || isPending) return
    onSend(value)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    // Auto-adjust height up to max ~120px
    const target = e.target
    target.style.height = 'auto'
    target.style.height = `${Math.min(target.scrollHeight, 120)}px`
  }

  return (
    <form onSubmit={handleSubmit} className={cn('relative', className)}>
      <div className="relative flex items-center rounded-2xl border border-border bg-card p-2 shadow-xs focus-within:border-accent focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 transition-all">
        <label htmlFor="chat-input-textarea" className="sr-only">
          Ask competitive intelligence question
        </label>
        <textarea
          id="chat-input-textarea"
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={disabled || isPending}
          placeholder={disabled ? 'Chat is available when the analysis completes' : placeholder}
          className="max-h-32 min-h-[40px] w-full resize-none bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        />

        <div className="flex items-center gap-2 pl-2">
          <Button
            type="submit"
            size="icon"
            disabled={!value.trim() || disabled || isPending}
            className="h-8 w-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-all shrink-0"
            aria-label="Send question"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between px-2 pt-1.5 text-[10px] text-muted-foreground">
        <span>Answers cite verified claims with exact snapshot quotes.</span>
        <span className="hidden sm:inline-flex items-center gap-1 font-mono">
          <span>Press</span>
          <kbd className="rounded border border-border bg-muted px-1 py-0.2">Enter</kbd>
          <span>to send</span>
        </span>
      </div>
    </form>
  )
}
