import { useState, ReactNode, useMemo } from 'react'
import { motion } from 'framer-motion'
import { ChevronUp, ChevronDown, ChevronsUpDown, Search, ChevronLeft, ChevronRight, AlignJustify, List, StretchHorizontal } from 'lucide-react'
import { cn } from '../../lib/utils'
import { SkeletonTable } from './Skeleton'
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

const densityIcons: Record<Density, typeof List> = {
  compact: AlignJustify,
  comfortable: List,
  spacious: StretchHorizontal,
}

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
  rowKey: (item: T) => string | number
  actions?: ReactNode
  stickyHeader?: boolean
  showDensityToggle?: boolean
  showTotals?: boolean
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
  rowKey,
  actions,
  stickyHeader = true,
  showDensityToggle = false,
  showTotals = false,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [density, setDensity] = useState<Density>(() => {
    try {
      return (localStorage.getItem('table-density') as Density) || 'comfortable'
    } catch { return 'comfortable' }
  })

  const dp = densityConfig[density]

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

  if (loading) {
    return <SkeletonTable rows={5} cols={columns.length} />
  }

  const totalPages = pagination ? Math.ceil(pagination.total / pagination.pageSize) : 1
  const DensityIcon = densityIcons[density]

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Toolbar */}
      {(searchable || actions || showDensityToggle) && (
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-4">
          {searchable && (
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
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
                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-gray-500 hover:text-gray-700"
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
          <thead className={cn('bg-gray-50', stickyHeader && 'sticky top-0 z-10 shadow-[0_1px_3px_0_rgba(0,0,0,0.05)]')}>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    dp.header,
                    'text-xs font-semibold text-gray-600 uppercase tracking-wider',
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                    col.sortable && 'cursor-pointer hover:bg-gray-100 transition-colors select-none',
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
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )
                        ) : (
                          <ChevronsUpDown className="w-4 h-4" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
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
              sortedData.map((item, index) => (
                <motion.tr
                  key={rowKey(item)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: index * 0.02 }}
                  onClick={() => onRowClick?.(item)}
                  className={cn(
                    'hover:bg-gray-50 transition-colors',
                    onRowClick && 'cursor-pointer'
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        dp.cell,
                        dp.text,
                        col.align === 'right' ? 'text-right tabular-nums' : col.align === 'center' ? 'text-center' : 'text-left'
                      )}
                    >
                      {col.render ? col.render(item) : (item as any)[col.key]}
                    </td>
                  ))}
                </motion.tr>
              ))
            )}
          </tbody>
          {/* Totals Row */}
          {hasTotals && sortedData.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-300 font-semibold">
                {columns.map((col, i) => (
                  <td
                    key={col.key}
                    className={cn(
                      dp.cell,
                      dp.text,
                      col.align === 'right' ? 'text-right tabular-nums' : col.align === 'center' ? 'text-center' : 'text-left',
                      'text-gray-900'
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
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {((pagination.page - 1) * pagination.pageSize) + 1} to{' '}
            {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{' '}
            {pagination.total} results
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-4 py-2 text-sm font-medium">
              Page {pagination.page} of {totalPages}
            </span>
            <button
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page >= totalPages}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
