import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'

export function useAnalyses() {
  return useQuery({ queryKey: ['analyses'], queryFn: () => api.listAnalyses() })
}

export function useAnalysis(id: string) {
  return useQuery({
    queryKey: ['analysis', id],
    queryFn: () => api.getAnalysis(id),
    // Fallback polling (3 s) while the run is in flight; the SSE hook (F2) is the primary channel.
    refetchInterval: (q) => {
      const s = q.state.data?.status
      return s === 'queued' || s === 'running' ? 3000 : false
    },
  })
}
