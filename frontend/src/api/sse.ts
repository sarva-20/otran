import { API_BASE_URL } from '@/lib/env'
import type { AgentEvent, StreamDoneStatus, StreamHandlers } from './types'

function parseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/**
 * Native EventSource wrapper. Contract: `event: agent_event` (AgentEvent JSON), final `event: done`.
 * Late subscribers get history first. On error we reconnect once; the consumer dedupes by event id.
 */
export function openRealEventStream(analysisId: string, handlers: StreamHandlers): () => void {
  let source: EventSource | null = null
  let retried = false
  let closed = false

  const connect = (): void => {
    const es = new EventSource(`${API_BASE_URL}/api/analyses/${analysisId}/events`)
    source = es

    es.addEventListener('agent_event', (e) => {
      const event = parseJson<AgentEvent>((e as MessageEvent<string>).data)
      if (event) handlers.onEvent(event)
    })

    es.addEventListener('done', (e) => {
      const body = parseJson<{ status: StreamDoneStatus }>((e as MessageEvent<string>).data)
      closed = true
      es.close()
      handlers.onDone(body?.status ?? 'completed')
    })

    es.onerror = () => {
      if (closed) return
      es.close()
      const willRetry = !retried
      handlers.onError?.(willRetry)
      if (willRetry) {
        retried = true
        setTimeout(() => {
          if (!closed) connect()
        }, 1000)
      }
    }
  }

  connect()
  return () => {
    closed = true
    source?.close()
  }
}
