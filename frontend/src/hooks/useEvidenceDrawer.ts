import * as React from 'react'
import { useSearchParams } from 'react-router-dom'

export function useEvidenceDrawer() {
  const [searchParams, setSearchParams] = useSearchParams()
  const claimId = searchParams.get('claim')
  const relatedParam = searchParams.get('related')
  const relatedClaimIds = React.useMemo(() => {
    if (!relatedParam) return claimId ? [claimId] : []
    const ids = relatedParam.split(',').map((s) => s.trim()).filter(Boolean)
    if (claimId && !ids.includes(claimId)) {
      ids.unshift(claimId)
    }
    return ids
  }, [claimId, relatedParam])

  const openClaim = React.useCallback(
    (id: string, allClaimIds?: string[]) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set('claim', id)
        if (allClaimIds && allClaimIds.length > 1) {
          next.set('related', allClaimIds.join(','))
        } else {
          next.delete('related')
        }
        return next
      })
    },
    [setSearchParams],
  )

  const closeClaim = React.useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('claim')
      next.delete('related')
      return next
    })
  }, [setSearchParams])

  return {
    claimId,
    relatedClaimIds,
    isOpen: Boolean(claimId),
    openClaim,
    closeClaim,
  }
}
