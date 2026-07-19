import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { showToast, parseApiError } from '@/lib/toast'

/**
 * Optimistic mutation helper.
 *
 * Snapshots ALL cached queries matching any of the given `queryKeyPrefixes`
 * (via queryClient.getQueriesData), applies an optimistic updater to each
 * cached list — whether the cache entry is a plain array or a DRF paginated
 * envelope ({ count, next, previous, results }) — rolls back every touched
 * entry on error, and invalidates the prefixes on settle.
 *
 * Optimistic items carry the `_isOptimistic: true` flag (and `_isLoading`)
 * so lists can render them with a subdued/loading style.
 */

type DrfEnvelope<T> = {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

function isDrfEnvelope<T>(value: unknown): value is DrfEnvelope<T> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray((value as DrfEnvelope<T>).results)
  )
}

type CountDelta = 1 | 0 | -1

/** Apply a list transform to cached data, preserving its shape (array or DRF envelope). */
function applyToCache<T>(
  cached: unknown,
  transform: (items: T[]) => T[],
  countDelta: CountDelta
): unknown {
  if (Array.isArray(cached)) {
    return transform(cached as T[])
  }
  if (isDrfEnvelope<T>(cached)) {
    return {
      ...cached,
      results: transform(cached.results),
      count: Math.max(0, (cached.count ?? cached.results.length) + countDelta),
    }
  }
  return cached
}

interface OptimisticMutationOptions<TData, TVariables> {
  mutationFn: (variables: TVariables) => Promise<{ data: TData }>
  /** Query key prefixes whose cached lists should be optimistically updated. */
  queryKeyPrefixes: QueryKey[]
  // For create operations - adds a placeholder item
  createPlaceholder?: (variables: TVariables) => Partial<TData> & { id: string | number }
  // For update operations - transforms existing items
  updateItem?: (variables: TVariables, oldData: TData[]) => TData[]
  // For delete operations - removes item by id
  deleteId?: (variables: TVariables) => string | number
  // Success/error messages
  successMessage?: string
  errorMessage?: string
  // Callback after mutation succeeds (before invalidation completes)
  onSuccess?: (data: TData, variables: TVariables) => void
  // Callback when mutation fails
  onError?: (error: unknown, variables: TVariables) => void
  // Whether to close modal immediately (optimistic)
  closeModal?: () => void
}

export function useOptimisticMutation<TData extends { id: string | number }, TVariables>({
  mutationFn,
  queryKeyPrefixes,
  createPlaceholder,
  updateItem,
  deleteId,
  successMessage,
  errorMessage,
  onSuccess,
  onError,
  closeModal,
}: OptimisticMutationOptions<TData, TVariables>) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn,
    onMutate: async (variables) => {
      // Close modal immediately for optimistic UX
      closeModal?.()

      // Cancel outgoing refetches for all affected prefixes
      await Promise.all(
        queryKeyPrefixes.map((queryKey) => queryClient.cancelQueries({ queryKey }))
      )

      // Snapshot every cached query matching any prefix
      const snapshots = new Map<string, { queryKey: QueryKey; data: unknown }>()
      for (const prefix of queryKeyPrefixes) {
        for (const [queryKey, data] of queryClient.getQueriesData({ queryKey: prefix })) {
          snapshots.set(JSON.stringify(queryKey), { queryKey, data })
        }
      }

      // Build the list transform + count delta for this operation
      let transform: ((items: TData[]) => TData[]) | null = null
      let countDelta: CountDelta = 0

      if (createPlaceholder) {
        const placeholder = {
          ...createPlaceholder(variables),
          _isOptimistic: true,
          _isLoading: true,
        } as unknown as TData
        transform = (items) => [placeholder, ...items]
        countDelta = 1
      } else if (updateItem) {
        transform = (items) => updateItem(variables, items)
        countDelta = 0
      } else if (deleteId) {
        const idToDelete = deleteId(variables)
        transform = (items) => items.filter((item) => item.id !== idToDelete)
        countDelta = -1
      }

      // Optimistically update every snapshotted cache entry
      if (transform) {
        for (const { queryKey, data } of snapshots.values()) {
          if (data === undefined || data === null) continue
          queryClient.setQueryData(queryKey, applyToCache<TData>(data, transform, countDelta))
        }
      }

      return { snapshots }
    },
    onSuccess: (response, variables) => {
      if (successMessage) {
        showToast.success(successMessage)
      }
      onSuccess?.(response.data, variables)
    },
    onError: (error, variables, context) => {
      // Rollback every touched cache entry from the snapshot map
      if (context?.snapshots) {
        for (const { queryKey, data } of context.snapshots.values()) {
          queryClient.setQueryData(queryKey, data)
        }
      }

      // Show error toast with user-friendly message
      const message = parseApiError(error, errorMessage || 'Operation failed')
      showToast.error(message)

      onError?.(error, variables)
    },
    onSettled: () => {
      // Invalidate all prefixes to get fresh data from the server
      for (const queryKey of queryKeyPrefixes) {
        queryClient.invalidateQueries({ queryKey })
      }
    },
  })
}

// Hook for optimistic create with loading placeholder
export function useOptimisticCreate<TData extends { id: string | number }, TVariables>({
  mutationFn,
  queryKeyPrefixes,
  createPlaceholder,
  successMessage = 'Created successfully',
  errorMessage = 'Failed to create',
  closeModal,
  onSuccess,
}: {
  mutationFn: (variables: TVariables) => Promise<{ data: TData }>
  queryKeyPrefixes: QueryKey[]
  createPlaceholder: (variables: TVariables) => Partial<TData> & { id: string | number }
  successMessage?: string
  errorMessage?: string
  closeModal?: () => void
  onSuccess?: (data: TData, variables: TVariables) => void
}) {
  return useOptimisticMutation({
    mutationFn,
    queryKeyPrefixes,
    createPlaceholder,
    successMessage,
    errorMessage,
    closeModal,
    onSuccess,
  })
}

// Hook for optimistic update
export function useOptimisticUpdate<
  TData extends { id: string | number },
  TVariables extends { id: string | number },
>({
  mutationFn,
  queryKeyPrefixes,
  successMessage = 'Updated successfully',
  errorMessage = 'Failed to update',
  closeModal,
  onSuccess,
}: {
  mutationFn: (variables: TVariables) => Promise<{ data: TData }>
  queryKeyPrefixes: QueryKey[]
  successMessage?: string
  errorMessage?: string
  closeModal?: () => void
  onSuccess?: (data: TData, variables: TVariables) => void
}) {
  return useOptimisticMutation({
    mutationFn,
    queryKeyPrefixes,
    updateItem: (variables, oldData) =>
      oldData.map((item) =>
        item.id === variables.id
          ? { ...item, ...variables, _isOptimistic: true, _isLoading: true }
          : item
      ) as TData[],
    successMessage,
    errorMessage,
    closeModal,
    onSuccess,
  })
}

// Hook for optimistic delete
export function useOptimisticDelete<TData extends { id: string | number }>({
  mutationFn,
  queryKeyPrefixes,
  successMessage = 'Deleted successfully',
  errorMessage = 'Failed to delete',
  onSuccess,
}: {
  mutationFn: (id: string | number) => Promise<any>
  queryKeyPrefixes: QueryKey[]
  successMessage?: string
  errorMessage?: string
  onSuccess?: () => void
}) {
  return useOptimisticMutation<TData, string | number>({
    mutationFn: (id) => mutationFn(id),
    queryKeyPrefixes,
    deleteId: (id) => id,
    successMessage,
    errorMessage,
    onSuccess: onSuccess ? () => onSuccess() : undefined,
  })
}
