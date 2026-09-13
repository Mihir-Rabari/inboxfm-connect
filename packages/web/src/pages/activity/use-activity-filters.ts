import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ExecutionStatus } from '@/lib/api/types'

export const ACTIVITY_STATUS_FILTER_VALUES = [
  'CREATED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const

export const ACTIVITY_LIMIT_VALUES = [10, 25, 50, 100] as const

export const DEFAULT_ACTIVITY_STATUS: ActivityStatusFilter = 'ALL'
export const DEFAULT_ACTIVITY_LIMIT = 10

export type ActivityStatusFilter = 'ALL' | ExecutionStatus

export interface ActivityFilters {
  status: ActivityStatusFilter
  limit: number
}

function parseStatus(raw: string | null): ActivityStatusFilter {
  if (raw === null || raw === 'ALL') {
    return DEFAULT_ACTIVITY_STATUS
  }
  const match = ACTIVITY_STATUS_FILTER_VALUES.find((candidate) => candidate === raw)
  return match ?? DEFAULT_ACTIVITY_STATUS
}

function parseLimit(raw: string | null): number {
  if (raw === null) {
    return DEFAULT_ACTIVITY_LIMIT
  }
  const parsed = Number(raw)
  const match = ACTIVITY_LIMIT_VALUES.find((candidate) => candidate === parsed)
  return match ?? DEFAULT_ACTIVITY_LIMIT
}

function serializeFilters(filters: ActivityFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.status !== 'ALL') {
    params.set('status', filters.status)
  }
  if (filters.limit !== DEFAULT_ACTIVITY_LIMIT) {
    params.set('limit', String(filters.limit))
  }
  return params
}

export function useActivityFilters() {
  const [searchParams, setSearchParams] = useSearchParams()

  const filters: ActivityFilters = {
    status: parseStatus(searchParams.get('status')),
    limit: parseLimit(searchParams.get('limit')),
  }

  const setFilters = useCallback(
    (next: Partial<ActivityFilters>) => {
      setSearchParams((previous) => {
        const merged: ActivityFilters = {
          status: parseStatus(next.status !== undefined ? paramOrNull(next.status) : previous.get('status')),
          limit: parseLimit(next.limit !== undefined ? paramOrNull(next.limit) : previous.get('limit')),
        }
        return serializeFilters(merged)
      })
    },
    [setSearchParams],
  )

  return { filters, setFilters }
}

function paramOrNull(value: ActivityStatusFilter | number): string | null {
  if (value === 'ALL' || value === DEFAULT_ACTIVITY_LIMIT || value === null) {
    return null
  }
  return String(value)
}
