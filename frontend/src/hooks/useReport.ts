import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Report } from '@/api/types'

export function useReport(analysisId: string, enabled = true) {
  return useQuery<Report, Error>({
    queryKey: ['report', analysisId],
    queryFn: () => api.getReport(analysisId),
    enabled: Boolean(analysisId) && enabled,
  })
}
