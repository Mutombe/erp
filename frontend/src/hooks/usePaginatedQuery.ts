import { useEffect } from 'react'
import { keepPreviousData, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { prefetchNextPage } from './usePrefetch'

interface Paginated<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

interface UsePagedListArgs<T> {
  /** Builds the exact paginated query key for a given page (filters folded in). */
  keyFor: (page: number) => QueryKey
  /** Fetches one page, resolving to a DRF paginated envelope. */
  fetchPage: (page: number) => Promise<Paginated<T>>
  /** Current 1-based page. */
  page: number
  /** Page size the backend paginates by (for totalPages math). */
  pageSize?: number
  enabled?: boolean
}

/**
 * A thin wrapper over `useQuery` for DRF-paginated list endpoints that:
 *   - keeps the previous page on screen while the next loads (`keepPreviousData`),
 *     so paging/filtering never blanks the table, and
 *   - prefetches `page + 1` into its exact key after each successful load, so
 *     paging forward is instant.
 *
 * The query key MUST fold in every active filter (via `keyFor`) so changing a
 * filter refetches while `keepPreviousData` prevents a flash of emptiness.
 */
export function usePagedList<T>({
  keyFor,
  fetchPage,
  page,
  pageSize = 25,
  enabled = true,
}: UsePagedListArgs<T>) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: keyFor(page),
    queryFn: () => fetchPage(page),
    placeholderData: keepPreviousData,
    enabled,
  })

  const total = query.data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  // Warm page+1 once the current page has settled successfully.
  useEffect(() => {
    if (!query.isSuccess) return
    prefetchNextPage(queryClient, {
      queryKey: keyFor(page + 1),
      queryFn: () => fetchPage(page + 1),
      page,
      totalPages,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.isSuccess, query.data, page, totalPages])

  return {
    ...query,
    results: query.data?.results ?? [],
    total,
    totalPages,
  }
}
