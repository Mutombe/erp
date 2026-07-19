import { useState, useRef, useEffect, useCallback } from 'react'
import { CaretDown, CircleNotch, MagnifyingGlass, X, Tray } from '@phosphor-icons/react'
import { cn } from '../../lib/utils'
import { Skeleton } from './Skeleton'

interface Option {
  value: string | number
  label: string
  description?: string
  icon?: React.ReactNode
}

interface AsyncSelectProps {
  label?: string
  placeholder?: string
  value: string | number | null
  onChange: (value: string | number) => void
  options: Option[]
  isLoading?: boolean
  error?: string
  required?: boolean
  disabled?: boolean
  searchable?: boolean
  clearable?: boolean
  className?: string
  emptyMessage?: string
  onSearch?: (query: string) => void
  onCreateNew?: () => void
  createNewLabel?: string
  recentItems?: Option[]
  recentLabel?: string
  /** Wrap long option labels onto as many lines as needed instead of
   *  truncating with an ellipsis. Words are never hyphenated — a break only
   *  happens at spaces (or mid-"word" when a single token exceeds the line).
   *  Use where the full name is needed to verify the pick, e.g. the journal
   *  account selector with 120+-character sub-account names. */
  wrap?: boolean
}

export function AsyncSelect({
  label,
  placeholder = 'Select...',
  value,
  onChange,
  options,
  isLoading = false,
  error,
  required = false,
  disabled = false,
  searchable = false,
  clearable = false,
  className,
  emptyMessage = 'No options available',
  onSearch,
  onCreateNew,
  createNewLabel = '+ Create new...',
  recentItems,
  recentLabel = 'Recently used',
  wrap = false,
}: AsyncSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearchTerm('')
        setHighlightedIndex(-1)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchable && inputRef.current) {
      inputRef.current.focus()
    }
    if (isOpen) {
      setHighlightedIndex(-1)
    }
  }, [isOpen, searchable])

  const selectedOption = options.find(opt => String(opt.value) === String(value))

  // When onSearch is provided, parent handles filtering server-side
  const filteredOptions = onSearch
    ? options
    : searchTerm
      ? options.filter(opt =>
          opt.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
          opt.description?.toLowerCase().includes(searchTerm.toLowerCase())
        )
      : options

  // Show recent items when search is empty
  const showRecentSection = !searchTerm && recentItems && recentItems.length > 0
  const displayOptions = showRecentSection
    ? [...recentItems.filter(r => !filteredOptions.some(o => String(o.value) === String(r.value))), ...filteredOptions]
    : filteredOptions

  const handleSelect = useCallback((optionValue: string | number) => {
    onChange(optionValue)
    setIsOpen(false)
    setSearchTerm('')
    setHighlightedIndex(-1)
  }, [onChange])

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('' as any)
  }, [onChange])

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-option]')
      const item = items[highlightedIndex] as HTMLElement
      if (item) {
        item.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightedIndex])

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        setIsOpen(true)
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex(prev =>
          prev < displayOptions.length - 1 ? prev + 1 : 0
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex(prev =>
          prev > 0 ? prev - 1 : displayOptions.length - 1
        )
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && highlightedIndex < displayOptions.length) {
          handleSelect(displayOptions[highlightedIndex].value)
        }
        break
      case 'Escape':
        e.preventDefault()
        setIsOpen(false)
        setSearchTerm('')
        setHighlightedIndex(-1)
        break
    }
  }, [isOpen, displayOptions, highlightedIndex, handleSelect])

  return (
    <div className={cn('relative', className)} ref={containerRef} onKeyDown={handleKeyDown}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={cn(
          'w-full flex items-center justify-between px-3 py-2.5 text-left text-sm bg-white border rounded-xl transition-all dark:bg-slate-900 dark:text-slate-200',
          isOpen ? 'border-primary-500 ring-2 ring-primary-100' : 'border-gray-200 hover:border-gray-300 dark:border-slate-600 dark:hover:border-slate-500',
          disabled && 'opacity-50 cursor-not-allowed bg-gray-50 dark:bg-slate-800',
          error && 'border-red-300 focus:ring-red-100'
        )}
      >
        <span className={cn(wrap ? 'whitespace-normal break-words min-w-0' : 'truncate', !selectedOption && 'text-gray-400')}>
          {selectedOption ? (
            <span className={cn('flex gap-2', wrap ? 'items-start' : 'items-center')}>
              {selectedOption.icon}
              {selectedOption.label}
            </span>
          ) : (
            placeholder
          )}
        </span>
        <div className="flex items-center gap-1 ml-2 shrink-0">
          {clearable && selectedOption && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              onClick={handleClear}
              className="p-0.5 text-gray-400 hover:text-gray-600 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <CaretDown className={cn(
            'w-4 h-4 text-gray-400 transition-transform',
            isOpen && 'rotate-180'
          )} />
        </div>
      </button>

      {error && (
        <p className="mt-1 text-sm text-red-500">{error}</p>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg dark:shadow-black/30 overflow-hidden animate-slide-up dark:bg-slate-900 dark:border-slate-600">
          {/* Search input */}
          {searchable && (
            <div className="p-2 border-b border-gray-100 dark:border-slate-700">
              <div className="relative">
                <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setHighlightedIndex(-1); onSearch?.(e.target.value) }}
                  className="w-full pl-9 pr-8 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200 dark:placeholder:text-slate-500"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => { setSearchTerm(''); setHighlightedIndex(-1) }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Options list */}
          <div className="max-h-60 overflow-y-auto" ref={listRef}>
            {isLoading ? (
              <div className="p-2 space-y-1">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
                    <Skeleton className="w-5 h-5 rounded" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className={cn('h-4 rounded', i % 2 === 0 ? 'w-3/4' : 'w-1/2')} />
                      <Skeleton className="h-3 w-2/3 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : displayOptions.length === 0 && !onCreateNew ? (
              <div className="px-4 py-6 text-center">
                <Tray className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">
                  {searchTerm ? `No results for "${searchTerm}"` : emptyMessage}
                </p>
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => { setSearchTerm(''); setHighlightedIndex(-1); onSearch?.('') }}
                    className="mt-2 text-xs text-primary-600 hover:text-primary-700 font-medium"
                  >
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              <div className="p-1">
                {showRecentSection && (
                  <div className="px-3 py-1.5 text-xs font-medium text-gray-400 uppercase tracking-wide">
                    {recentLabel}
                  </div>
                )}
                {displayOptions.map((option, index) => (
                  <button
                    key={option.value}
                    type="button"
                    data-option
                    onClick={() => handleSelect(option.value)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm rounded-lg transition-colors',
                      String(option.value) === String(value)
                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                        : index === highlightedIndex
                          ? 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-200'
                          : 'hover:bg-gray-50 text-gray-700 dark:text-slate-300 dark:hover:bg-slate-800'
                    )}
                  >
                    {option.icon && (
                      <span className="flex-shrink-0 text-gray-400">
                        {option.icon}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      {/* wrap: show the FULL label across as many lines as it
                          needs (no ellipsis, no hyphenation) so long
                          sub-account names can be verified before posting. */}
                      <div className={cn('font-medium', wrap ? 'whitespace-normal break-words' : 'truncate')}>{option.label}</div>
                      {option.description && (
                        <div className={cn('text-xs text-gray-500', wrap ? 'whitespace-normal break-words' : 'truncate')}>{option.description}</div>
                      )}
                    </div>
                    {String(option.value) === String(value) && (
                      <div className="w-2 h-2 rounded-full bg-primary-500" />
                    )}
                  </button>
                ))}
                {onCreateNew && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setIsOpen(false); onCreateNew() }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm rounded-lg text-primary-600 hover:bg-primary-50 font-medium transition-colors border-t border-gray-100 dark:border-slate-700 mt-1 dark:text-primary-400 dark:hover:bg-slate-800"
                  >
                    {createNewLabel}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Simple loading select placeholder
export function SelectSkeleton({ label }: { label?: string }) {
  return (
    <div>
      {label && <Skeleton className="h-4 w-20 mb-1.5" />}
      <div className="relative">
        <Skeleton className="h-11 w-full rounded-xl" />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <CircleNotch className="w-4 h-4 text-gray-300 animate-spin" />
        </div>
      </div>
    </div>
  )
}

export default AsyncSelect
