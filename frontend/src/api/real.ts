import { API_BASE_URL } from '@/lib/env'
import { ApiError } from './errors'
import { openRealEventStream } from './sse'
import type {
  Analysis, ApiClient, ChangesQuery, Change, ChatResponse, Claim, Health, Matrix, Report, Snapshot,
} from './types'

async function request<T>(path: string, init?: RequestInit, parse: 'json' | 'text' = 'json'): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
  } catch {
    throw new ApiError(0, `Cannot reach the API at ${API_BASE_URL}`)
  }
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = (await res.json()) as { detail?: unknown }
      if (typeof body.detail === 'string') detail = body.detail
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail)
  }
  return (parse === 'text' ? await res.text() : await res.json()) as T
}

const post = (body?: unknown): RequestInit => ({
  method: 'POST',
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})

export const realApi: ApiClient = {
  health: () => request<Health>('/health'),
  listAnalyses: () => request<Analysis[]>('/api/analyses'),
  createAnalysis: (body) => request<Analysis>('/api/analyses', post(body)),
  getAnalysis: (id) => request<Analysis>(`/api/analyses/${id}`),
  rerunAnalysis: (id) => request<Analysis>(`/api/analyses/${id}/rerun`, post()),
  getMatrix: (id) => request<Matrix>(`/api/analyses/${id}/matrix`),
  getChanges: (id, query: ChangesQuery = {}) => {
    const qs = new URLSearchParams()
    if (query.product_id) qs.set('product_id', query.product_id)
    if (query.severity) qs.set('severity', query.severity)
    const suffix = qs.size ? `?${qs.toString()}` : ''
    return request<Change[]>(`/api/analyses/${id}/changes${suffix}`)
  },
  getReport: (id) => request<Report>(`/api/analyses/${id}/report?format=json`),
  getReportMarkdown: (id) => request<string>(`/api/analyses/${id}/report?format=md`, undefined, 'text'),
  chat: (id, body) => request<ChatResponse>(`/api/analyses/${id}/chat`, post(body)),
  getClaim: (claimId) => request<Claim>(`/api/claims/${claimId}`),
  getSnapshot: (snapshotId) => request<Snapshot>(`/api/snapshots/${snapshotId}`),
  openEventStream: (id, handlers) => openRealEventStream(id, handlers),
}
