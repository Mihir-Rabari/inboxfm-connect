import * as React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth/auth-context'
import { LoadingState } from '@/components/ui/loading-state'

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return <LoadingState rows={4} />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return children
}
