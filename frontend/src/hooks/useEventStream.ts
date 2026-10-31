import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { AgentEvent, StreamDoneStatus, StreamHandlers } from '@/api/types'

export type StreamStatus = 'connecting' | 'live' | 'done' | 'failed' | 'error'

export interface UseEventStreamResult {
  events: AgentEvent[]
  status: StreamStatus
  retrying: boolean
  retry: () => void
  reset: () => void
}

export function useEventStream(
  analysisId: string,
  fallbackAnalysisStatus?: string,
): UseEventStreamResult {
  const qc = useQueryClient()
  const [events, setEvents] = React.useState<AgentEvent[]>([])
  const [status, setStatus] = React.useState<StreamStatus>('connecting')
  const [retrying, setRetrying] = React.useState<boolean>(false)
  const [reconnectCount, setReconnectCount] = React.useState(0)

  // Track if closed to prevent updating state after teardown
  const unsubscribeRef = React.useRef<(() => void) | null>(null)

  // Fallback to analysis query status if stream is error/dead and polling detected completion
  React.useEffect(() => {
    if (fallbackAnalysisStatus === 'completed' && status !== 'done') {
      setStatus('done')
      setRetrying(false)
    } else if (fallbackAnalysisStatus === 'failed' && status !== 'failed') {
      setStatus('failed')
      setRetrying(false)
    }
  }, [fallbackAnalysisStatus, status])

  const retry = React.useCallback(() => {
    setStatus('connecting')
    setRetrying(false)
    setReconnectCount((c) => c + 1)
  }, [])

  const reset = React.useCallback(() => {
    setEvents([])
    setStatus('connecting')
    setRetrying(false)
    setReconnectCount((c) => c + 1)
  }, [])

  React.useEffect(() => {
    let isCancelled = false

    setStatus((s) => (s === 'done' || s === 'failed' ? s : 'connecting'))

    const handlers: StreamHandlers = {
      onEvent: (event: AgentEvent) => {
        if (isCancelled) return
        setEvents((prev) => {
          if (prev.some((e) => e.id === event.id)) return prev
          const next = [...prev, event]
          next.sort((a, b) => a.id - b.id)
          return next
        })
        setStatus((s) => (s === 'done' || s === 'failed' ? s : 'live'))
        setRetrying(false)
      },
      onDone: (doneStatus: StreamDoneStatus) => {
        if (isCancelled) return
        setStatus(doneStatus === 'completed' ? 'done' : 'failed')
        setRetrying(false)
        void qc.invalidateQueries({ queryKey: ['analyses'] })
        void qc.invalidateQueries({ queryKey: ['analysis', analysisId] })
      },
      onError: (willRetry: boolean) => {
        if (isCancelled) return
        if (willRetry) {
          setRetrying(true)
          setStatus('connecting')
        } else {
          setRetrying(false)
          setStatus('error')
        }
      },
    }

    const unsub = api.openEventStream(analysisId, handlers)
    unsubscribeRef.current = unsub

    return () => {
      isCancelled = true
      unsub()
      unsubscribeRef.current = null
    }
  }, [analysisId, qc, reconnectCount])

  return { events, status, retrying, retry, reset }
}
