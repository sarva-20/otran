import * as React from 'react'
import type { ChangeType } from '@/api/types'
import { cn } from '@/lib/utils'

interface DiffBlockProps {
  changeType: ChangeType
  before?: string | null
  after?: string | null
  className?: string
}

function computeWordDiff(beforeText: string, afterText: string) {
  const bTokens = beforeText.split(/(\s+)/)
  const aTokens = afterText.split(/(\s+)/)
  const m = bTokens.length
  const n = aTokens.length

  const dp: number[] = new Array((m + 1) * (n + 1)).fill(0)
  const get = (i: number, j: number): number => dp[i * (n + 1) + j] ?? 0
  const set = (i: number, j: number, val: number): void => {
    dp[i * (n + 1) + j] = val
  }

  for (let i = 0; i < m; i++) {
    const bWord = bTokens[i]
    for (let j = 0; j < n; j++) {
      const aWord = aTokens[j]
      if (bWord === aWord) {
        set(i + 1, j + 1, get(i, j) + 1)
      } else {
        set(i + 1, j + 1, Math.max(get(i + 1, j), get(i, j + 1)))
      }
    }
  }

  let i = m
  let j = n
  const bResult: { text: string; isDiff: boolean }[] = []
  const aResult: { text: string; isDiff: boolean }[] = []

  while (i > 0 || j > 0) {
    const bWord = i > 0 ? (bTokens[i - 1] ?? '') : ''
    const aWord = j > 0 ? (aTokens[j - 1] ?? '') : ''

    if (i > 0 && j > 0 && bWord === aWord) {
      bResult.unshift({ text: bWord, isDiff: false })
      aResult.unshift({ text: aWord, isDiff: false })
      i--
      j--
    } else if (j > 0 && (i === 0 || get(i, j - 1) >= get(i - 1, j))) {
      const isWhitespace = aWord.trim().length === 0
      aResult.unshift({ text: aWord, isDiff: !isWhitespace })
      j--
    } else if (i > 0 && (j === 0 || get(i, j - 1) < get(i - 1, j))) {
      const isWhitespace = bWord.trim().length === 0
      bResult.unshift({ text: bWord, isDiff: !isWhitespace })
      i--
    }
  }

  return { bResult, aResult }
}

export function DiffBlock({ changeType, before, after, className }: DiffBlockProps) {
  const hasBefore = before !== null && before !== undefined && before !== ''
  const hasAfter = after !== null && after !== undefined && after !== ''

  const { bResult, aResult } = React.useMemo(() => {
    if (changeType === 'modified' && hasBefore && hasAfter) {
      return computeWordDiff(before, after)
    }
    return {
      bResult: hasBefore ? [{ text: before, isDiff: false }] : [],
      aResult: hasAfter ? [{ text: after, isDiff: false }] : [],
    }
  }, [changeType, before, after, hasBefore, hasAfter])

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-border/80 bg-card font-mono text-xs shadow-2xs',
        className,
      )}
    >
      {/* Before Line */}
      {hasBefore ? (
        <div className="flex items-start gap-2.5 bg-danger-soft/50 px-3 py-2 text-danger border-b border-border/50">
          <span className="select-none font-bold text-danger shrink-0 w-3 text-center">-</span>
          <div className="flex-1 whitespace-pre-wrap leading-relaxed">
            {bResult.map((part, idx) =>
              part.isDiff ? (
                <mark
                  key={idx}
                  className="rounded bg-danger/20 px-1 py-0.5 font-semibold text-danger underline decoration-danger/40"
                >
                  {part.text}
                </mark>
              ) : (
                <span key={idx}>{part.text}</span>
              ),
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2.5 bg-muted/40 px-3 py-1.5 text-muted-foreground/70 italic border-b border-border/50">
          <span className="select-none shrink-0 w-3 text-center">·</span>
          <span>(none — absent prior to this run)</span>
        </div>
      )}

      {/* After Line */}
      {hasAfter ? (
        <div className="flex items-start gap-2.5 bg-success-soft/50 px-3 py-2 text-success">
          <span className="select-none font-bold text-success shrink-0 w-3 text-center">+</span>
          <div className="flex-1 whitespace-pre-wrap leading-relaxed">
            {aResult.map((part, idx) =>
              part.isDiff ? (
                <mark
                  key={idx}
                  className="rounded bg-success/20 px-1 py-0.5 font-semibold text-success underline decoration-success/40"
                >
                  {part.text}
                </mark>
              ) : (
                <span key={idx}>{part.text}</span>
              ),
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2.5 bg-muted/40 px-3 py-1.5 text-muted-foreground/70 italic">
          <span className="select-none shrink-0 w-3 text-center">·</span>
          <span>(absent — removed in this run)</span>
        </div>
      )}
    </div>
  )
}
