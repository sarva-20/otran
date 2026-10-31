import * as React from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { AgentTrace } from '@/components/AgentTrace'
import { MatrixTable } from '@/components/MatrixTable'
import { ProgressHeader } from '@/components/ProgressHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAnalysis } from '@/hooks/useAnalyses'
import { useEventStream } from '@/hooks/useEventStream'
import { useEvidenceDrawer } from '@/hooks/useEvidenceDrawer'
import { useMatrix } from '@/hooks/useMatrix'
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
  const { events, status, retrying, retry } = useEventStream(id, data?.status)

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
    return (
      <div className="rounded-2xl border border-danger/30 bg-danger-soft p-6 text-sm text-danger">
        <p className="font-semibold">Failed to load analysis.</p>
        <p className="mt-1 text-xs">{error?.message || 'Analysis record not found'}</p>
        <div className="mt-4 flex gap-3">
          <Button size="sm" variant="outline" onClick={() => void refetch()} className="border-danger/30 text-danger hover:bg-danger/10">
            Retry
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

        {activeTab !== 'live' && activeTab !== 'matrix' && (
          <div
            id={`panel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`tab-${activeTab}`}
            tabIndex={0}
            className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/60 p-16 text-center focus-visible:outline-none"
          >
            <h3 className="text-sm font-medium text-foreground">
              {TABS.find((t) => t.key === activeTab)?.label} View
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">Coming in F4+</p>
          </div>
        )}
      </div>
    </div>
  )
}
