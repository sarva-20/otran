import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Analysis } from '@/api/types'

export function useRerun(
  analysisId: string,
  onRerunSuccess?: (analysis: Analysis) => void,
) {
  const qc = useQueryClient()

  return useMutation<Analysis, Error, void>({
    mutationFn: () => api.rerunAnalysis(analysisId),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ['analysis', analysisId] })
      void qc.invalidateQueries({ queryKey: ['analyses'] })
      void qc.invalidateQueries({ queryKey: ['matrix', analysisId] })
      void qc.invalidateQueries({ queryKey: ['changes', analysisId] })
      void qc.invalidateQueries({ queryKey: ['report', analysisId] })
      onRerunSuccess?.(data)
    },
  })
}
