import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Matrix } from '@/api/types'

export function useMatrix(analysisId: string) {
  return useQuery<Matrix, Error>({
    queryKey: ['matrix', analysisId],
    queryFn: () => api.getMatrix(analysisId),
    enabled: Boolean(analysisId),
  })
}
