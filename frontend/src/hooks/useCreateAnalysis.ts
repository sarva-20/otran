import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import type { Analysis, AnalysisCreate } from '@/api/types'

export function useCreateAnalysis() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useMutation<Analysis, Error, AnalysisCreate>({
    mutationFn: (body: AnalysisCreate) => api.createAnalysis(body),
    onSuccess: (analysis) => {
      void queryClient.invalidateQueries({ queryKey: ['analyses'] })
      navigate(`/analysis/${analysis.id}`)
    },
  })
}
