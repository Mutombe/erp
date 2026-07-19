import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { cn } from '../../lib/utils'

interface PaginationProps {
  currentPage: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  showPageSize?: boolean
  pageSizeOptions?: number[]
  className?: string
}

export function Pagination({
  currentPage,
  totalPages: rawTotalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  showPageSize = true,
  pageSizeOptions = [10, 25, 50, 100],
  className,
}: PaginationProps) {
  // Normalize: ensure totalPages is at least 1, currentPage is within bounds
  const totalPages = Math.max(1, rawTotalPages)
  const safePage = Math.max(1, Math.min(currentPage, totalPages))

  const startItem = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1
  const endItem = Math.min(safePage * pageSize, totalItems)

  // Safe page change that clamps to valid range
  const handlePageChange = (page: number) => {
    const clamped = Math.max(1, Math.min(page, totalPages))
    if (clamped !== currentPage) {
      onPageChange(clamped)
    }
  }

  const getVisiblePages = () => {
    const delta = 2
    const range: (number | string)[] = []
    const rangeWithDots: (number | string)[] = []

    for (let i = 1; i <= totalPages; i++) {
      if (
        i === 1 ||
        i === totalPages ||
        (i >= safePage - delta && i <= safePage + delta)
      ) {
        range.push(i)
      }
    }

    let prev: number | null = null
    for (const i of range) {
      if (prev !== null) {
        if (typeof i === 'number' && i - prev === 2) {
          rangeWithDots.push(prev + 1)
        } else if (typeof i === 'number' && i - prev !== 1) {
          rangeWithDots.push('...')
        }
      }
      rangeWithDots.push(i)
      prev = typeof i === 'number' ? i : prev
    }

    return rangeWithDots
  }

  if (totalPages <= 1 && !showPageSize) {
    return null
  }

  return (
    <div className={cn('flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200', className)}>
      <div className="flex items-center gap-4">
        <p className="text-sm text-gray-600">
          Showing <span className="font-medium">{startItem}</span> to{' '}
          <span className="font-medium">{endItem}</span> of{' '}
          <span className="font-medium">{totalItems}</span> results
        </p>

        {showPageSize && onPageSizeChange && (
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500">Per page:</label>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="text-sm bg-white border border-gray-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <nav className="flex items-center gap-1">
          <button
            onClick={() => handlePageChange(1)}
            disabled={safePage === 1}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="First page"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => handlePageChange(safePage - 1)}
            disabled={safePage === 1}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1 mx-2">
            {getVisiblePages().map((page, index) => (
              typeof page === 'number' ? (
                <button
                  key={index}
                  onClick={() => handlePageChange(page)}
                  className={cn(
                    'min-w-[36px] h-9 px-3 text-sm font-medium rounded-lg transition-colors',
                    page === safePage
                      ? 'bg-primary-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  )}
                >
                  {page}
                </button>
              ) : (
                <span key={index} className="px-2 text-gray-400">
                  {page}
                </span>
              )
            ))}
          </div>

          <button
            onClick={() => handlePageChange(safePage + 1)}
            disabled={safePage === totalPages}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => handlePageChange(totalPages)}
            disabled={safePage === totalPages}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Last page"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </nav>
      )}
    </div>
  )
}

// Compact pagination for smaller spaces
export function PaginationCompact({
  currentPage,
  totalPages: rawTotalPages,
  onPageChange,
  className,
}: Pick<PaginationProps, 'currentPage' | 'totalPages' | 'onPageChange' | 'className'>) {
  const totalPages = Math.max(1, rawTotalPages)
  const safePage = Math.max(1, Math.min(currentPage, totalPages))

  if (totalPages <= 1) {
    return null
  }

  const handlePageChange = (page: number) => {
    const clamped = Math.max(1, Math.min(page, totalPages))
    if (clamped !== currentPage) {
      onPageChange(clamped)
    }
  }

  return (
    <div className={cn('flex items-center justify-center gap-2', className)}>
      <button
        onClick={() => handlePageChange(safePage - 1)}
        disabled={safePage === 1}
        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-sm text-gray-600">
        Page <span className="font-medium">{safePage}</span> of{' '}
        <span className="font-medium">{totalPages}</span>
      </span>
      <button
        onClick={() => handlePageChange(safePage + 1)}
        disabled={safePage === totalPages}
        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}
