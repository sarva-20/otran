import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Change, ChangesQuery } from '@/api/types'

export function useChanges(analysisId: string, query: ChangesQuery = {}) {
  return useQuery<Change[], Error>({
    queryKey: ['changes', analysisId, query.product_id, query.severity],
    queryFn: () => api.getChanges(analysisId, query),
    enabled: Boolean(analysisId),
  })
}
