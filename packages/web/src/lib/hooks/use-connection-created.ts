import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

interface UseConnectionCreatedResult {
  /** Invalidates connection queries and returns the developer to the integration's connections tab. */
  handleConnectionCreated: (connectionDisplayName: string) => void
}

export function useConnectionCreated(pieceName?: string): UseConnectionCreatedResult {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const handleConnectionCreated = useCallback(
    (connectionDisplayName: string) => {
      void queryClient.invalidateQueries({ queryKey: ['connections'] })
      if (pieceName) {
        void queryClient.invalidateQueries({ queryKey: ['integration', pieceName] })
      }
      toast.success(`${connectionDisplayName} connected`)
      if (pieceName) {
        navigate(`/integrations/${encodeURIComponent(pieceName)}?tab=connections`, { replace: true })
      } else {
        navigate('/connections', { replace: true })
      }
    },
    [queryClient, navigate, pieceName]
  )

  return { handleConnectionCreated }
}
