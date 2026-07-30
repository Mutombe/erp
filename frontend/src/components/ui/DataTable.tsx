import { useState, useEffect, useRef, ReactNode, useMemo } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { CaretUp, CaretDown, CaretUpDown, MagnifyingGlass, CaretLeft, CaretRight, TextAlignJustify, ListBullets, Rows, CircleNotch } from '@phosphor-icons/react'
import { cn } from '../../lib/utils'
import { SkeletonTable, Skeleton } from './Skeleton'
import { EmptyState } from './EmptyState'

export interface Column<T> {
  key: string
  header: string
  render?: (item: T) => ReactNode
  sortable?: boolean
  align?: 'left' | 'center' | 'right'
  width?: string
  /** For column totals — provide a function to extract the numeric value */
  total?: (item: T) => number
  /** Render function for the total cell */
  totalRender?: (sum: number) => ReactNode
}

type Density = 'compact' | 'comfortable' | 'spacious'

const densityConfig: Record<Density, { cell: string; header: string; text: string }> = {
  compact: { cell: 'px-4 py-2', header: 'px-4 py-2.5', text: 'text-xs' },
  comfortable: { cell: 'px-6 py-4', header: 'px-6 py-4', text: 'text-sm' },
  spacious: { cell: 'px-6 py-5', header: 'px-6 py-5', text: 'text-sm' },
}

const densityIcons: Record<Density, typeof ListBullets> = {
  compact: TextAlignJustify,
  comfortable: ListBullets,
  spacious: Rows,
}

// --- Progressive reveal tuning ------------------------------------------------
/** Lists at or below this size reveal instantly — no stagger needed. */
const PROGRESSIVE_MIN_ROWS = 12
/** Number of reveal batches the first load is split into. */
const REVEAL_STEPS = 20
/** Delay between reveal batches (ms). */
const REVEAL_INTERVAL = 28
/** Trailing skeleton rows shown while the first load is still revealing. */
const MAX_TRAILING_SKELETONS = 6

/**
 * Progressive / chronological row reveal.
 *
 * On the FIRST load with data, rows are revealed top-to-bottom in ~20 batches
 * (`setTimeout` chained ~28ms apart) so a long list "fills in" instead of
 * snapping. A `animatedOnce` ref guarantees this only ever happens once —
 * subsequent refetches, pagination and filter changes update in place with no
 * stagger replay. Small lists (≤ `PROGRESSIVE_MIN_ROWS`) and reduced-motion
 * users skip the stagger entirely.
 *
 * Returns the number of rows to render right now. While that is below the row
 * count, the caller pads the table with trailing skeletons for a stable height.
 */
export function useProgressiveReveal(total: number, enabled: boolean): number {
  const animatedOnce = useRef(false)
  const [revealCount, setRevealCount] = useState(() =>
    enabled && total > PROGRESSIVE_MIN_ROWS ? 0 : total
  )

  useEffect(() => {
    // Already animated once, disabled, or a trivially short list → show all now.
    if (!enabled || animatedOnce.current || total <= PROGRESSIVE_MIN_ROWS) {
      setRevealCount(total)
      if (total > 0) animatedOnce.current = true
      return
    }

    // First substantial load — stagger the reveal top-to-bottom.
    animatedOnce.current = true
    const perStep = Math.max(1, Math.ceil(total / REVEAL_STEPS))
    let shown = 0
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      shown = Math.min(total, shown + perStep)
      setRevealCount(shown)
      if (shown < total) timer = setTimeout(tick, REVEAL_INTERVAL)
    }
    setRevealCount(0)
    timer = setTimeout(tick, REVEAL_INTERVAL)
    return () => clearTimeout(timer)
  }, [enabled, total])

  return revealCount
}

/** A row may carry these transient flags (set by useOptimisticMutation etc.). */
type RowFlags = { _isOptimistic?: boolean; _isLoading?: boolean; _isBusy?: boolean }

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  loading?: boolean
  searchable?: boolean
  searchPlaceholder?: string
  onSearch?: (query: string) => void
  searchValue?: string
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: { label: string; onClick: () => void }
  pagination?: {
    page: number
    pageSize: number
    total: number
    onPageChange: (page: number) => void
  }
  onRowClick?: (item: T) => void
  /** Fires on mouse-enter of a row (skipped for optimistic rows). Ideal for hover-prefetch. */
  onRowHover?: (item: T) => void
  rowKey: (item: T) => string | number
  actions?: ReactNode
  stickyHeader?: boolean
  showDensityToggle?: boolean
  showTotals?: boolean
  /** Opt out of the first-load progressive reveal animation. Defaults to on. */
  progressive?: boolean
}

export function DataTable<T>({
  columns,
  data,
  loading = false,
  searchable = false,
  searchPlaceholder = 'Search...',
  onSearch,
  searchValue = '',
  emptyTitle = 'No data found',
  emptyDescription = 'There are no records to display.',
  emptyAction,
  pagination,
  onRowClick,
  onRowHover,
  rowKey,
  actions,
  stickyHeader = true,
  showDensityToggle = false,
  showTotals = false,
  progressive = true,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [density, setDensity] = useState<Density>(() => {
    try {
      return (localStorage.getItem('table-density') as Density) || 'comfortable'
    } catch { return 'comfortable' }
  })

  const dp = densityConfig[density]
  const reduceMotion = useReducedMotion()

  const cycleDensity = () => {
    const order: Density[] = ['compact', 'comfortable', 'spacious']
    const next = order[(order.indexOf(density) + 1) % order.length]
    setDensity(next)
    try { localStorage.setItem('table-density', next) } catch {}
  }

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortedData = sortKey
    ? [...data].sort((a: any, b: any) => {
        const aVal = a[sortKey]
        const bVal = b[sortKey]
        if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
        if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
        return 0
      })
    : data

  // Calculate totals for columns that have total functions
  const hasTotals = showTotals && columns.some(col => col.total)
  const totals = useMemo(() => {
    if (!hasTotals) return {}
    const result: Record<string, number> = {}
    columns.forEach(col => {
      if (col.total) {
        result[col.key] = data.reduce((sum, item) => sum + (col.total!(item) || 0), 0)
      }
    })
    return result
  }, [data, columns, hasTotals])

  // Progressive reveal is disabled for reduced-motion users.
  const revealEnabled = progressive && !reduceMotion
  const revealCount = useProgressiveReveal(sortedData.length, revealEnabled)
  const visibleRows = revealCount >= sortedData.length ? sortedData : sortedData.slice(0, revealCount)
  const trailingSkeletons = Math.min(MAX_TRAILING_SKELETONS, sortedData.length - visibleRows.length)

  if (loading) {
    return <SkeletonTable rows={5} cols={columns.length} />
  }

  const totalPages = pagination ? Math.ceil(pagination.total / pagination.pageSize) : 1
  const DensityIcon = densityIcons[density]

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden dark:bg-slate-900 dark:border-slate-700">
      {/* Toolbar */}
      {(searchable || actions || showDensityToggle) && (
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-4 dark:border-slate-700">
          {searchable && (
            <div className="relative flex-1 max-w-md">
              <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={searchValue}
                onChange={(e) => onSearch?.(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200 dark:placeholder:text-slate-500"
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            {showDensityToggle && (
              <button
                onClick={cycleDensity}
                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-gray-500 hover:text-gray-700 dark:border-slate-600 dark:hover:bg-slate-800"
                title={`Density: ${density}`}
              >
                <DensityIcon className="w-4 h-4" />
              </button>
            )}
            {actions}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className={cn('bg-gray-50 dark:bg-slate-800/60', stickyHeader && 'sticky top-0 z-10 shadow-[0_1px_3px_0_rgba(0,0,0,0.05)]')}>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    dp.header,
                    'text-xs font-semibold text-gray-600 uppercase tracking-wider dark:text-slate-400',
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                    col.sortable && 'cursor-pointer hover:bg-gray-100 transition-colors select-none dark:hover:bg-slate-800',
                    col.width
                  )}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div className={cn('flex items-center gap-2', col.align === 'right' && 'justify-end')}>
                    {col.header}
                    {col.sortable && (
                      <span className="text-gray-400">
                        {sortKey === col.key ? (
                          sortDir === 'asc' ? (
                            <CaretUp className="w-4 h-4" />
                          ) : (
                            <CaretDown className="w-4 h-4" />
                          )
                        ) : (
                          <CaretUpDown className="w-4 h-4" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
            {sortedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-12">
                  <EmptyState
                    title={emptyTitle}
                    description={emptyDescription}
                    action={emptyAction}
                  />
                </td>
              </tr>
            ) : (
              <AnimatePresence>
                {visibleRows.map((item) => {
                  const flags = item as RowFlags
                  const isOptimistic = !!flags._isOptimistic
                  const isBusy = !!flags._isBusy || !!flags._isLoading
                  const clickable = !!onRowClick && !isOptimistic
                  return (
                    <motion.tr
                      key={rowKey(item)}
                      initial={reduceMotion ? false : { opacity: 0, y: -4 }}
                      animate={{ opacity: isOptimistic ? 0.6 : isBusy ? 0.7 : 1, y: 0 }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                      transition={{ duration: reduceMotion ? 0 : 0.22 }}
                      onClick={clickable ? () => onRowClick!(item) : undefined}
                      onMouseEnter={onRowHover && !isOptimistic ? () => onRowHover(item) : undefined}
                      className={cn(
                        'transition-colors',
                        clickable && 'cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/50',
                        isOptimistic && 'bg-primary-50/40 dark:bg-primary-900/10 pointer-events-none select-none',
                      )}
                    >
                      {columns.map((col, colIndex) => (
                        <td
                          key={col.key}
                          className={cn(
                            dp.cell,
                            dp.text,
                            col.align === 'right' ? 'text-right tabular-nums' : col.align === 'center' ? 'text-center' : 'text-left'
                          )}
                        >
                          {colIndex === 0 && isBusy ? (
                            <span className="inline-flex items-center gap-2">
                              <CircleNotch className="w-3.5 h-3.5 text-primary-500 animate-spin shrink-0" />
                              {col.render ? col.render(item) : (item as any)[col.key]}
                            </span>
                          ) : (
                            col.render ? col.render(item) : (item as any)[col.key]
                          )}
                        </td>
                      ))}
                    </motion.tr>
                  )
                })}
                {/* Trailing skeletons keep table height stable while the first load reveals. */}
                {Array.from({ length: trailingSkeletons }).map((_, i) => (
                  <tr key={`reveal-skeleton-${i}`} aria-hidden>
                    {columns.map((col) => (
                      <td key={col.key} className={cn(dp.cell, dp.text)}>
                        <Skeleton className="h-4 w-full max-w-[8rem] dark:bg-slate-700" />
                      </td>
                    ))}
                  </tr>
                ))}
              </AnimatePresence>
            )}
          </tbody>
          {/* Totals Row */}
          {hasTotals && sortedData.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-300 font-semibold dark:bg-slate-800/60 dark:border-slate-600">
                {columns.map((col, i) => (
                  <td
                    key={col.key}
                    className={cn(
                      dp.cell,
                      dp.text,
                      col.align === 'right' ? 'text-right tabular-nums' : col.align === 'center' ? 'text-center' : 'text-left',
                      'text-gray-900 dark:text-slate-100'
                    )}
                  >
                    {col.total && totals[col.key] !== undefined
                      ? (col.totalRender ? col.totalRender(totals[col.key]) : totals[col.key].toLocaleString())
                      : (i === 0 ? 'Total' : '')}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.total > pagination.pageSize && (
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between dark:border-slate-700">
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Showing {((pagination.page - 1) * pagination.pageSize) + 1} to{' '}
            {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{' '}
            {pagination.total} results
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors dark:border-slate-600 dark:hover:bg-slate-800"
            >
              <CaretLeft className="w-4 h-4" />
            </button>
            <span className="px-4 py-2 text-sm font-medium">
              Page {pagination.page} of {totalPages}
            </span>
            <button
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page >= totalPages}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors dark:border-slate-600 dark:hover:bg-slate-800"
            >
              <CaretRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
