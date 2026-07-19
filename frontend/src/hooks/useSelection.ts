import { useState, useCallback, useEffect, useRef } from 'react'

type SelectableId = string | number

interface UseSelectionOptions {
  clearOnChange?: unknown[]
}

export function useSelection<TId extends SelectableId = number>(
  options: UseSelectionOptions = {}
) {
  const { clearOnChange = [] } = options
  const [selectedIds, setSelectedIds] = useState<Set<TId>>(new Set())
  const isFirstRender = useRef(true)

  // Auto-clear when dependencies change (search, filters, etc.)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    setSelectedIds(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, clearOnChange)

  const selectedCount = selectedIds.size
  const hasSelection = selectedCount > 0

  const isSelected = useCallback(
    (id: TId) => selectedIds.has(id),
    [selectedIds]
  )

  const toggle = useCallback((id: TId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const selectPage = useCallback((ids: TId[]) => {
    setSelectedIds((prev) => {
      const allSelected = ids.every((id) => prev.has(id))
      const next = new Set(prev)
      if (allSelected) {
        ids.forEach((id) => next.delete(id))
      } else {
        ids.forEach((id) => next.add(id))
      }
      return next
    })
  }, [])

  const isAllPageSelected = useCallback(
    (pageIds: TId[]) => pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id)),
    [selectedIds]
  )

  const isPartialPageSelected = useCallback(
    (pageIds: TId[]) => pageIds.some((id) => selectedIds.has(id)) && !pageIds.every((id) => selectedIds.has(id)),
    [selectedIds]
  )

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const setSelection = useCallback((ids: TId[]) => {
    setSelectedIds(new Set(ids))
  }, [])

  return {
    selectedIds,
    selectedCount,
    hasSelection,
    isSelected,
    toggle,
    selectPage,
    isAllPageSelected,
    isPartialPageSelected,
    clearSelection,
    setSelection,
  }
}
