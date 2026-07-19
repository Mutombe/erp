import { Search, X, Calendar } from 'lucide-react'
import { DatePicker } from './DatePicker'

interface TableFilterProps {
  searchPlaceholder?: string
  onSearchChange: (query: string) => void
  searchValue: string
  showDateFilter?: boolean
  dateFrom?: string
  dateTo?: string
  onDateFromChange?: (date: string) => void
  onDateToChange?: (date: string) => void
  showStatusFilter?: boolean
  statusOptions?: { value: string; label: string }[]
  statusValue?: string
  onStatusChange?: (status: string) => void
  resultCount?: number
}

export function TableFilter({
  searchPlaceholder,
  onSearchChange,
  searchValue,
  showDateFilter,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  showStatusFilter,
  statusOptions,
  statusValue,
  onStatusChange,
  resultCount,
}: TableFilterProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-6 py-3 bg-gray-50 border-b border-gray-100">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder={searchPlaceholder || 'Search...'}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        {searchValue && (
          <button onClick={() => onSearchChange('')} className="absolute right-2 top-1/2 -translate-y-1/2">
            <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
          </button>
        )}
      </div>

      {/* Date range */}
      {showDateFilter && (
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <DatePicker
            value={dateFrom}
            onChange={(v) => onDateFromChange?.(v)}
            className="min-w-[150px]"
          />
          <span className="text-gray-400 text-sm">to</span>
          <DatePicker
            value={dateTo}
            onChange={(v) => onDateToChange?.(v)}
            className="min-w-[150px]"
          />
        </div>
      )}

      {/* Status filter */}
      {showStatusFilter && statusOptions && (
        <select
          value={statusValue}
          onChange={(e) => onStatusChange?.(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">All Statuses</option>
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}

      {/* Result count */}
      {resultCount !== undefined && (
        <span className="text-xs text-gray-500">
          {resultCount} result{resultCount !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  )
}
