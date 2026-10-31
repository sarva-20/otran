import * as React from 'react'
import { AlertCircle, ArrowLeft, FileQuestion, RefreshCw } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { AgentTrace } from '@/components/AgentTrace'
import { ChangeTimeline } from '@/components/ChangeTimeline'
import { ChatPanel } from '@/components/ChatPanel'
import { MatrixTable } from '@/components/MatrixTable'
import { ProgressHeader } from '@/components/ProgressHeader'
import { ReportView } from '@/components/ReportView'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAnalysis } from '@/hooks/useAnalyses'
import { useChat } from '@/hooks/useChat'
import { useEventStream } from '@/hooks/useEventStream'
import { useEvidenceDrawer } from '@/hooks/useEvidenceDrawer'
import { useMatrix } from '@/hooks/useMatrix'
import { useRerun } from '@/hooks/useRerun'
import { cn } from '@/lib/utils'

type TabKey = 'live' | 'matrix' | 'changes' | 'report' | 'chat'

interface TabItem {
  key: TabKey
  label: string
}

const TABS: TabItem[] = [
  { key: 'live', label: 'Live' },
  { key: 'matrix', label: 'Matrix' },
  { key: 'changes', label: 'Changes' },
  { key: 'report', label: 'Report' },
  { key: 'chat', label: 'Chat' },
]

function parseHashTab(): TabKey | null {
  const hash = window.location.hash.replace('#', '').toLowerCase()
  if (TABS.some((t) => t.key === hash)) {
    return hash as TabKey
  }
  return null
}

export function Analysis() {
  const { id = '' } = useParams<{ id: string }>()
  const { data, isLoading, isError, error, refetch } = useAnalysis(id)

  // Track if this analysis was already completed on initial page mount
  const initialStatusCapturedRef = React.useRef(false)
  const isCompletedOnLoadRef = React.useRef(false)

  if (!initialStatusCapturedRef.current && data) {
    initialStatusCapturedRef.current = true
    isCompletedOnLoadRef.current = data.status === 'completed'
  }
  const isCompletedOnLoad = isCompletedOnLoadRef.current

  // Active tab state (synced with URL hash)
  const [activeTab, setActiveTab] = React.useState<TabKey>(() => {
    return parseHashTab() ?? 'live'
  })

  // Synchronize default tab once data loads (if no explicit hash was supplied)
  const hasAppliedDefaultTabRef = React.useRef(false)
  React.useEffect(() => {
    if (data && !hasAppliedDefaultTabRef.current) {
      hasAppliedDefaultTabRef.current = true
      const hashTab = parseHashTab()
      if (!hashTab) {
        const defaultTab = data.status === 'completed' ? 'matrix' : 'live'
        setActiveTab(defaultTab)
        window.location.hash = defaultTab
      }
    }
  }, [data])

  // Listen for manual hash changes (e.g. browser back/forward)
  React.useEffect(() => {
    const handleHashChange = () => {
      const hashTab = parseHashTab()
      if (hashTab) {
        setActiveTab(hashTab)
      }
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const switchTab = React.useCallback((tab: TabKey) => {
    setActiveTab(tab)
    window.location.hash = tab
  }, [])

  // Event stream subscription
  const { events, status, retrying, retry, reset: resetStream } = useEventStream(id, data?.status)

  // Chat conversation state (persists across tab switches, clears on rerun)
  const chat = useChat(id)

  // Auto-switch to Live on rerun success
  const handleRerunSuccess = React.useCallback(() => {
    resetStream()
    chat.clearMessages()
    hasAutoSwitchedRef.current = false
    switchTab('live')
  }, [resetStream, chat, switchTab])

  // Rerun mutation for ProgressHeader
  const headerRerun = useRerun(id, handleRerunSuccess)

  // Matrix query & evidence drawer
  const {
    data: matrix,
    isLoading: isMatrixLoading,
    isError: isMatrixError,
    error: matrixError,
    refetch: refetchMatrix,
  } = useMatrix(id)
  const { openClaim } = useEvidenceDrawer()

  // Auto-switch to Matrix tab ~1.5s after live stream completes
  const hasAutoSwitchedRef = React.useRef(false)
  const activeTabRef = React.useRef(activeTab)
  activeTabRef.current = activeTab

  React.useEffect(() => {
    if (status === 'done' && !hasAutoSwitchedRef.current && !isCompletedOnLoad) {
      hasAutoSwitchedRef.current = true
      const timer = setTimeout(() => {
        if (activeTabRef.current === 'live') {
          switchTab('matrix')
        }
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [status, isCompletedOnLoad, switchTab])

  // Keyboard navigation for tablist
  const tabRefs = React.useRef<(HTMLButtonElement | null)[]>([])
  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex = index
    if (e.key === 'ArrowRight') {
      nextIndex = (index + 1) % TABS.length
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (index - 1 + TABS.length) % TABS.length
    } else if (e.key === 'Home') {
      nextIndex = 0
    } else if (e.key === 'End') {
      nextIndex = TABS.length - 1
    } else {
      return
    }

    e.preventDefault()
    const targetTab = TABS[nextIndex]
    if (targetTab) {
      switchTab(targetTab.key)
      tabRefs.current[nextIndex]?.focus()
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-10 w-80 rounded-full" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    )
  }

  if (isError || !data) {
    const isNotFound =
      (error instanceof ApiError && error.status === 404) ||
      error?.message?.toLowerCase().includes('not found')

    if (isNotFound) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <FileQuestion className="h-6 w-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Analysis Not Found</h1>
            <p className="text-xs text-muted-foreground leading-relaxed">
              No analysis exists with ID <span className="font-mono font-medium text-foreground">{id}</span>. It may have been deleted or the link might be incorrect.
            </p>
          </div>
          <div className="flex items-center gap-2.5 pt-2">
            <Link to="/">
              <Button size="sm">
                Back to Analyses
              </Button>
            </Link>
          </div>
        </div>
      )
    }

    return (
      <div className="rounded-2xl border border-danger/30 bg-danger-soft p-6 text-sm text-danger max-w-xl mx-auto space-y-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p className="font-semibold">Cannot reach the API or load analysis.</p>
        </div>
        <p className="text-xs text-foreground/80 leading-relaxed">
          {error?.message || 'The server could not be reached. Verify that the backend is running and CORS is configured.'}
        </p>
        <div className="flex items-center gap-3 pt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void refetch()}
            className="gap-2 border-danger/30 text-danger hover:bg-danger/10"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Retry</span>
          </Button>
          <Link to="/">
            <Button size="sm" variant="ghost">
              Back to Home
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  const isLive = data.status === 'running' || status === 'live'

  return (
    <div className="space-y-8">
      {/* Navigation Breadcrumb */}
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>All analyses</span>
        </Link>
      </div>

      {/* Progress & Metadata Header */}
      <ProgressHeader
        analysis={data}
        latestEvent={events[events.length - 1]}
        isRunning={isLive}
        onRerun={() => headerRerun.mutate()}
        isRerunning={headerRerun.isPending}
      />

      {/* Tab Navigation */}
      <div className="space-y-4">
        <div
          role="tablist"
          aria-label="Analysis sections"
          className="flex items-center gap-1.5 overflow-x-auto border-b border-border pb-px"
        >
          {TABS.map((tab, idx) => {
            const isSelected = activeTab === tab.key
            return (
              <button
                key={tab.key}
                id={`tab-${tab.key}`}
                ref={(el) => {
                  tabRefs.current[idx] = el
                }}
                role="tab"
                type="button"
                aria-selected={isSelected}
                aria-controls={`panel-${tab.key}`}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => switchTab(tab.key)}
                onKeyDown={(e) => handleKeyDown(e, idx)}
                className={cn(
                  'relative flex items-center gap-1.5 whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  isSelected
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.key === 'live' && isLive && (
                  <span className="relative flex h-2 w-2 mr-1">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                  </span>
                )}
                <span>{tab.label}</span>
                {isSelected && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-primary" />
                )}
              </button>
            )
          })}
        </div>

        {/* Tab Panels */}
        {activeTab === 'live' && (
          <div
            id="panel-live"
            role="tabpanel"
            aria-labelledby="tab-live"
            tabIndex={0}
            className="focus-visible:outline-none"
          >
            <AgentTrace
              events={events}
              status={status}
              retrying={retrying}
              retry={retry}
              products={data.products}
              isInitialCompleted={isCompletedOnLoad}
            />
          </div>
        )}

        {activeTab === 'matrix' && (
          <div
            id="panel-matrix"
            role="tabpanel"
            aria-labelledby="tab-matrix"
            tabIndex={0}
            className="focus-visible:outline-none"
          >
            <MatrixTable
              matrix={matrix}
              isLoading={isMatrixLoading}
              isError={isMatrixError}
              error={matrixError}
              onRetry={() => void refetchMatrix()}
              onOpenClaim={openClaim}
            />
          </div>
        )}

        {activeTab === 'changes' && (
          <div
            id="panel-changes"
            role="tabpanel"
            aria-labelledby="tab-changes"
            tabIndex={0}
            className="focus-visible:outline-none"
          >
            <ChangeTimeline
              analysis={data}
              onOpenClaim={openClaim}
              onRerunSuccess={handleRerunSuccess}
            />
          </div>
        )}

        {activeTab === 'report' && (
          <div
            id="panel-report"
            role="tabpanel"
            aria-labelledby="tab-report"
            tabIndex={0}
            className="focus-visible:outline-none"
          >
            <ReportView
              analysis={data}
              onOpenClaim={openClaim}
            />
          </div>
        )}

        {activeTab === 'chat' && (
          <div
            id="panel-chat"
            role="tabpanel"
            aria-labelledby="tab-chat"
            tabIndex={0}
            className="focus-visible:outline-none"
          >
            <ChatPanel
              analysis={data}
              messages={chat.messages}
              onSendMessage={chat.sendMessage}
              onRetryTurn={chat.retryTurn}
              onOpenClaim={openClaim}
              onSwitchToMatrix={() => switchTab('matrix')}
              isPending={chat.isPending}
            />
          </div>
        )}
      </div>
    </div>
  )
}
