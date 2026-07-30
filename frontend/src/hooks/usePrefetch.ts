import { useCallback } from 'react'
import { useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query'

/** Detail data stays fresh for a minute after a hover-prefetch — long enough to
 *  cover the click-through without a redundant refetch. */
const DEFAULT_DETAIL_STALE_TIME = 60 * 1000

/**
 * Returns a row-hover handler that warms the detail cache the detail page will
 * read, so navigating into a row feels instant.
 *
 *   const prefetch = usePrefetchDetail(
 *     (j: Journal) => qk.journals.detail(j.id),
 *     (j: Journal) => journalsApi.get(j.id).then((r) => r.data),
 *   )
 *   <DataTable onRowHover={prefetch} ... />
 *
 * The returned handler is a no-op-safe callback: it never throws and does not
 * refetch data that is already fresh in the cache.
 */
export function usePrefetchDetail<T>(
  keyFn: (row: T) => QueryKey,
  fetchFn: (row: T) => Promise<unknown>,
  staleTime: number = DEFAULT_DETAIL_STALE_TIME
) {
  const queryClient = useQueryClient()
  return useCallback(
    (row: T) => {
      queryClient.prefetchQuery({
        queryKey: keyFn(row),
        queryFn: () => fetchFn(row),
        staleTime,
      })
    },
    // keyFn/fetchFn are expected to be stable (defined inline per render is fine
    // — prefetchQuery de-dupes in-flight requests by key regardless).
    [queryClient, keyFn, fetchFn, staleTime]
  )
}

interface PrefetchNextPageArgs<T> {
  /** The exact paginated query key for `page + 1`. */
  queryKey: QueryKey
  /** Fetcher for `page + 1`. */
  queryFn: () => Promise<T>
  page: number
  totalPages: number
  staleTime?: number
}

/**
 * Imperatively prefetch the next page of a paginated list into its exact query
 * key, so paging forward renders from cache. No-ops on the last page.
 */
export function prefetchNextPage<T>(
  queryClient: QueryClient,
  { queryKey, queryFn, page, totalPages, staleTime = DEFAULT_DETAIL_STALE_TIME }: PrefetchNextPageArgs<T>
): void {
  if (page >= totalPages) return
  queryClient.prefetchQuery({ queryKey, queryFn, staleTime })
}
