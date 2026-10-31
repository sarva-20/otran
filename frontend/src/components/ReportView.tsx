import * as React from 'react'
import Markdown, { type Components } from 'react-markdown'
import {
  AlertCircle,
  Check,
  Clock,
  Copy,
  Download,
  FileDown,
  FileText,
  Loader2,
  RotateCcw,
  Shield,
  Sparkles,
  TrendingDown,
} from 'lucide-react'
import { api } from '@/api/client'
import type { Analysis, Severity } from '@/api/types'
import { BattlecardCard } from '@/components/BattlecardCard'
import { CitationChip } from '@/components/CitationChip'
import { GapCard } from '@/components/GapCard'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useReport } from '@/hooks/useReport'
import { splitTextByCitations } from '@/lib/citations'
import { formatRelativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'

interface ReportViewProps {
  analysis: Analysis
  onOpenClaim?: (claimId: string, allClaimIds?: string[]) => void
  className?: string
}

const SEVERITY_RANK: Record<Severity, number> = {
  high: 3,
  medium: 2,
  low: 1,
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

export function ReportView({ analysis, onOpenClaim, className }: ReportViewProps) {
  const isRunning = analysis.status === 'queued' || analysis.status === 'running'
  const { data: report, isLoading, isError, error, refetch } = useReport(analysis.id, !isRunning)

  const [isDownloading, setIsDownloading] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [activeSection, setActiveSection] = React.useState<'summary' | 'gaps' | 'battlecards' | 'full'>('summary')

  // Smooth scroll to anchor without changing the URL tab hash
  const scrollToAnchor = (id: 'summary' | 'gaps' | 'battlecards' | 'full') => {
    setActiveSection(id)
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const handleDownload = async () => {
    try {
      setIsDownloading(true)
      const md = await api.getReportMarkdown(analysis.id)
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `otran-${analysis.id}-run${analysis.run_number ?? 1}.md`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      setNotice('Markdown file downloaded.')
      setTimeout(() => setNotice(null), 3000)
    } catch {
      setNotice('Failed to download markdown report.')
      setTimeout(() => setNotice(null), 3000)
    } finally {
      setIsDownloading(false)
    }
  }

  const handleCopy = async () => {
    try {
      const md = await api.getReportMarkdown(analysis.id)
      await navigator.clipboard.writeText(md)
      setCopied(true)
      setNotice('Markdown copied to clipboard.')
      setTimeout(() => {
        setCopied(false)
        setNotice(null)
      }, 3000)
    } catch {
      setNotice('Failed to copy markdown.')
      setTimeout(() => setNotice(null), 3000)
    }
  }

  // Markdown component renderers replacing [claim:c_xxx] tokens with CitationChip
  const markdownComponents: Partial<Components> = React.useMemo(
    () => ({
      p: ({ children }) => (
        <p className="mb-4 text-sm leading-relaxed text-foreground">
          {renderChildrenWithCitations(children, onOpenClaim)}
        </p>
      ),
      li: ({ children }) => (
        <li className="mb-1 text-sm leading-relaxed text-foreground">
          {renderChildrenWithCitations(children, onOpenClaim)}
        </li>
      ),
      h1: ({ children }) => (
        <h1 className="mt-6 mb-3 text-2xl font-bold tracking-tight text-foreground">
          {renderChildrenWithCitations(children, onOpenClaim)}
        </h1>
      ),
      h2: ({ children }) => (
        <h2 className="mt-6 mb-3 text-lg font-semibold tracking-tight text-foreground border-b border-border/50 pb-1.5">
          {renderChildrenWithCitations(children, onOpenClaim)}
        </h2>
      ),
      h3: ({ children }) => (
        <h3 className="mt-4 mb-2 text-base font-semibold text-foreground">
          {renderChildrenWithCitations(children, onOpenClaim)}
        </h3>
      ),
      code: ({ children, className }) => (
        <code className={cn('rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground', className)}>
          {children}
        </code>
      ),
      pre: ({ children }) => (
        <pre className="my-3 overflow-x-auto rounded-xl border border-border bg-muted/30 p-3 font-mono text-xs">
          {children}
        </pre>
      ),
      blockquote: ({ children }) => (
        <blockquote className="my-3 border-l-2 border-accent pl-3 italic text-muted-foreground">
          {children}
        </blockquote>
      ),
      table: ({ children }) => (
        <div className="my-4 overflow-x-auto rounded-xl border border-border">
          <table className="w-full border-collapse text-xs text-left">{children}</table>
        </div>
      ),
      th: ({ children }) => (
        <th className="border-b border-border bg-muted/60 p-2.5 font-semibold text-foreground">
          {children}
        </th>
      ),
      td: ({ children }) => (
        <td className="border-b border-border/60 p-2.5 text-foreground">
          {renderChildrenWithCitations(children, onOpenClaim)}
        </td>
      ),
    }),
    [onOpenClaim],
  )

  // 1. Run in flight state
  if (isRunning) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/60 p-16 text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Clock className="h-5 w-5 text-muted-foreground" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">Report in progress</h3>
        <p className="mt-1.5 max-w-sm text-xs text-muted-foreground leading-relaxed">
          The executive analyst report, strategic gaps, and battlecards are automatically synthesized when the agent analysis run completes.
        </p>
      </div>
    )
  }

  // 2. Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-36 rounded-2xl" />
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }

  // 3. Error state
  if (isError || !report) {
    return (
      <div
        className="flex items-center justify-between rounded-2xl border border-danger/30 bg-danger-soft p-6 text-sm text-danger"
        role="alert"
      >
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Unable to load analyst report</p>
            <p className="text-xs text-danger/80">{error?.message || 'Report not available'}</p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void refetch()}
          className="border-danger/30 text-danger hover:bg-danger/10"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    )
  }

  const sortedGaps = [...report.gaps].sort(
    (a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0),
  )

  return (
    <div className={cn('space-y-6', className)}>
      {/* Toast Notification */}
      {notice && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-xs font-medium text-foreground shadow-lg animate-row-in"
        >
          <Check className="h-4 w-4 text-success" />
          <span>{notice}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Strategic Intelligence Report
            </h2>
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-2 font-mono">
            <span>run {analysis.run_number ?? 1}</span>
            <span>·</span>
            <span title={new Date(report.generated_at).toLocaleString()}>
              Generated {formatRelativeTime(report.generated_at)}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="h-9 px-3 gap-1.5 text-xs font-medium"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? 'Copied' : 'Copy markdown'}</span>
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleDownload}
            disabled={isDownloading}
            className="h-9 px-3.5 gap-1.5 text-xs font-medium"
          >
            {isDownloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            <span>Download .md</span>
          </Button>
        </div>
      </div>

      {/* Sticky In-Page Section Navigation */}
      <div className="sticky top-16 z-20 flex items-center gap-2 overflow-x-auto rounded-full border border-border/80 bg-background/90 px-4 py-2 backdrop-blur shadow-xs">
        <span className="text-xs font-semibold text-muted-foreground uppercase mr-2 text-[10px]">
          Jump to:
        </span>
        {[
          { id: 'summary', label: 'Executive Summary', icon: Sparkles },
          { id: 'gaps', label: `Gaps (${report.gaps.length})`, icon: TrendingDown },
          { id: 'battlecards', label: `Battlecards (${report.battlecards.length})`, icon: Shield },
          { id: 'full', label: 'Full Report', icon: FileText },
        ].map((sec) => (
          <button
            key={sec.id}
            type="button"
            onClick={() => scrollToAnchor(sec.id as 'summary' | 'gaps' | 'battlecards' | 'full')}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              activeSection === sec.id
                ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground border border-border/60',
            )}
          >
            <sec.icon className="h-3 w-3" />
            <span>{sec.label}</span>
          </button>
        ))}
      </div>

      {/* Section 1: Executive Summary */}
      <section id="summary" className="space-y-3 scroll-mt-32">
        <div className="rounded-2xl border border-accent/25 bg-accent/5 p-6 shadow-xs">
          <div className="flex items-center gap-2 mb-2">
            <span className="rounded-full bg-accent text-accent-foreground px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
              Executive Summary
            </span>
          </div>
          <p className="text-base font-medium leading-relaxed text-foreground">
            {report.executive_summary}
          </p>
        </div>
      </section>

      {/* Section 2: Strategic Gaps */}
      <section id="gaps" className="space-y-3 scroll-mt-32">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-warning" />
            <h3 className="text-base font-semibold tracking-tight text-foreground">
              Strategic Gaps & Disadvantages
            </h3>
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            {sortedGaps.length} identified
          </span>
        </div>

        {sortedGaps.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center text-xs text-muted-foreground">
            No competitive gaps detected in this analysis.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {sortedGaps.map((gap, idx) => (
              <GapCard
                key={`${gap.dimension}-${idx}`}
                gap={gap}
                onOpenClaim={onOpenClaim}
              />
            ))}
          </div>
        )}
      </section>

      {/* Section 3: Battlecards */}
      <section id="battlecards" className="space-y-3 scroll-mt-32">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-accent" />
            <h3 className="text-base font-semibold tracking-tight text-foreground">
              Competitor Battlecards
            </h3>
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            {report.battlecards.length} competitors
          </span>
        </div>

        {report.battlecards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center text-xs text-muted-foreground">
            No battlecards synthesized yet.
          </div>
        ) : (
          <div className="space-y-4">
            {report.battlecards.map((battlecard) => (
              <BattlecardCard
                key={battlecard.competitor_id}
                battlecard={battlecard}
                products={analysis.products}
                onOpenClaim={onOpenClaim}
              />
            ))}
          </div>
        )}
      </section>

      {/* Section 4: Full Markdown Narrative */}
      <section id="full" className="space-y-3 scroll-mt-32">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileDown className="h-4 w-4 text-accent" />
            <h3 className="text-base font-semibold tracking-tight text-foreground">
              Full Narrative Report
            </h3>
          </div>
          <span className="font-mono text-[11px] text-muted-foreground">
            Citations link directly to immutable snapshots
          </span>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-xs">
          <Markdown components={markdownComponents}>{report.markdown}</Markdown>
        </div>
      </section>
    </div>
  )
}
