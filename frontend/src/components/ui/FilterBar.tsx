import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Funnel, X, MagnifyingGlass, CaretDown, Check } from '@phosphor-icons/react'
import { cn } from '../../lib/utils'
import { DatePicker } from './DatePicker'
import type {
  FilterConfig,
  FilterControl,
  FilterOption,
  UseUrlFiltersReturn,
} from '@/hooks/useUrlFilters'

// Re-export the config types so pages can import everything filter-related from
// the ui barrel alongside <FilterBar />.
export type { FilterConfig, FilterControl, FilterOption } from '@/hooks/useUrlFilters'

interface FilterBarProps {
  config: FilterConfig
  /** The object returned by `useUrlFilters(config)`. */
  filters: UseUrlFiltersReturn
  className?: string
  /** Optional right-aligned actions (e.g. an Excel / PDF download button). */
  actions?: ReactNode
}

const controlText = (c: Extract<FilterControl, { field: string }>): string =>
  ('label' in c && c.label) || c.field.replace(/_/g, ' ').replace(/^\w/, (m) => m.toUpperCase())

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

function SearchControl({ control, filters }: { control: Extract<FilterControl, { type: 'search' }>; filters: UseUrlFiltersReturn }) {
  const { searchValue, setSearch } = filters
  return (
    <div className="relative flex-1 min-w-[200px] max-w-sm">
      <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      <input
        type="text"
        value={searchValue}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={control.placeholder || 'Search...'}
        className="w-full pl-9 pr-8 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200 dark:placeholder:text-slate-500"
      />
      {searchValue && (
        <button
          type="button"
          onClick={() => setSearch('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600"
          aria-label="Clear search"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chips / segmented
// ---------------------------------------------------------------------------

const pillClass = (active: boolean) =>
  cn(
    'px-3 py-1.5 text-sm rounded-full border transition-colors',
    active
      ? 'bg-primary-600 text-white border-primary-600'
      : 'border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800'
  )

function ChipsControl({ control, filters }: { control: Extract<FilterControl, { type: 'chips' }>; filters: UseUrlFiltersReturn }) {
  const { params, setParam, removeParam, toggleMulti } = filters
  const selected = control.multi
    ? (params[`${control.field}__in`] ?? '').split(',').filter(Boolean)
    : params[control.field]
      ? [params[control.field]]
      : []

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {control.options.map((opt) => {
        const active = selected.includes(opt.value)
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              if (control.multi) toggleMulti(control.field, opt.value)
              else if (active) removeParam(control.field)
              else setParam(control.field, opt.value)
            }}
            className={pillClass(active)}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Select / multi-select facet (static or query-loaded options)
// ---------------------------------------------------------------------------

function SelectControl({ control, filters }: { control: Extract<FilterControl, { type: 'select' }>; filters: UseUrlFiltersReturn }) {
  const { params, setParam, removeParam, toggleMulti } = filters
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const hasQuery = !!control.query
  const optionsQuery = useQuery({
    queryKey: control.query?.queryKey ?? ['filterbar-noop', control.field],
    queryFn: () => control.query!.queryFn(),
    enabled: hasQuery,
    staleTime: 5 * 60 * 1000,
  })
  const options: FilterOption[] = hasQuery
    ? (optionsQuery.data ?? []).map(control.query!.toOption)
    : control.options ?? []

  const selected = control.multi
    ? (params[`${control.field}__in`] ?? '').split(',').filter(Boolean)
    : params[control.field]
      ? [params[control.field]]
      : []

  const filtered = useMemo(() => {
    if (!control.searchable || !q) return options
    const needle = q.toLowerCase()
    return options.filter((o) => o.label.toLowerCase().includes(needle))
  }, [options, q, control.searchable])

  const labelFor = (value: string) => options.find((o) => o.value === value)?.label ?? value
  const summary =
    selected.length === 0
      ? control.placeholder || controlText(control)
      : selected.length === 1
        ? labelFor(selected[0])
        : `${selected.length} selected`

  const pick = (value: string) => {
    if (control.multi) {
      toggleMulti(control.field, value)
    } else if (selected.includes(value)) {
      removeParam(control.field)
      setOpen(false)
    } else {
      setParam(control.field, value)
      setOpen(false)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-colors min-w-[9rem]',
          selected.length
            ? 'border-primary-400 bg-primary-50 text-primary-700 dark:border-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
            : 'border-gray-200 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:border-gray-300 dark:hover:border-slate-500'
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{summary}</span>
        <CaretDown className={cn('w-4 h-4 shrink-0 ml-auto text-gray-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden dark:bg-slate-900 dark:border-slate-600">
          {control.searchable && (
            <div className="p-2 border-b border-gray-100 dark:border-slate-700">
              <div className="relative">
                <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search..."
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-primary-500 dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200"
                />
              </div>
            </div>
          )}
          <div className="max-h-60 overflow-y-auto p-1" role="listbox">
            {optionsQuery.isLoading ? (
              <div className="px-3 py-2.5 text-sm text-gray-400 text-center">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-2.5 text-sm text-gray-400 text-center">No options</div>
            ) : (
              filtered.map((opt) => {
                const active = selected.includes(opt.value)
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => pick(opt.value)}
                    className={cn(
                      'w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm rounded-lg transition-colors',
                      active
                        ? 'bg-primary-50 text-primary-700 font-medium dark:bg-primary-900/30 dark:text-primary-300'
                        : 'text-gray-700 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800'
                    )}
                  >
                    <span className="truncate">{opt.label}</span>
                    {active && <Check className="w-4 h-4 shrink-0 text-primary-600 dark:text-primary-400" />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Date range
// ---------------------------------------------------------------------------

function DateRangeControl({ control, filters }: { control: Extract<FilterControl, { type: 'dateRange' }>; filters: UseUrlFiltersReturn }) {
  const { params, setParam } = filters
  const gte = `${control.field}__gte`
  const lte = `${control.field}__lte`
  return (
    <div className="flex items-center gap-1.5">
      <DatePicker value={params[gte] ?? ''} onChange={(v) => setParam(gte, v)} placeholder="From" className="w-36" />
      <span className="text-gray-400 text-sm">–</span>
      <DatePicker value={params[lte] ?? ''} onChange={(v) => setParam(lte, v)} placeholder="To" className="w-36" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Amount range
// ---------------------------------------------------------------------------

function AmountRangeControl({ control, filters }: { control: Extract<FilterControl, { type: 'amountRange' }>; filters: UseUrlFiltersReturn }) {
  const { params, setParam } = filters
  const gte = `${control.field}__gte`
  const lte = `${control.field}__lte`
  const [minP, maxP] = control.placeholder ?? ['Min', 'Max']
  const inputClass =
    'w-24 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200 dark:placeholder:text-slate-500'
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        inputMode="decimal"
        step={control.step ?? 'any'}
        value={params[gte] ?? ''}
        onChange={(e) => setParam(gte, e.target.value)}
        placeholder={minP}
        className={inputClass}
      />
      <span className="text-gray-400 text-sm">–</span>
      <input
        type="number"
        inputMode="decimal"
        step={control.step ?? 'any'}
        value={params[lte] ?? ''}
        onChange={(e) => setParam(lte, e.target.value)}
        placeholder={maxP}
        className={inputClass}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Boolean (tri-state: Yes / No / unset)
// ---------------------------------------------------------------------------

function BooleanControl({ control, filters }: { control: Extract<FilterControl, { type: 'boolean' }>; filters: UseUrlFiltersReturn }) {
  const { params, setParam, removeParam } = filters
  const value = params[control.field]
  const set = (next: 'true' | 'false') => (value === next ? removeParam(control.field) : setParam(control.field, next))
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm text-gray-600 dark:text-slate-400">{control.label}</span>
      <button type="button" onClick={() => set('true')} className={pillClass(value === 'true')}>
        Yes
      </button>
      <button type="button" onClick={() => set('false')} className={pillClass(value === 'false')}>
        No
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

function Control({ control, filters }: { control: FilterControl; filters: UseUrlFiltersReturn }) {
  switch (control.type) {
    case 'search':
      return <SearchControl control={control} filters={filters} />
    case 'chips':
      return <ChipsControl control={control} filters={filters} />
    case 'select':
      return <SelectControl control={control} filters={filters} />
    case 'dateRange':
      return <DateRangeControl control={control} filters={filters} />
    case 'amountRange':
      return <AmountRangeControl control={control} filters={filters} />
    case 'boolean':
      return <BooleanControl control={control} filters={filters} />
  }
}

/**
 * Declarative, URL-persisted filter bar. Drive it with a `FilterConfig` and the
 * state object from `useUrlFilters(config)`. Renders the controls, a wrapping
 * row of removable active-filter chips and a "Clear all" link.
 */
export function FilterBar({ config, filters, className, actions }: FilterBarProps) {
  const { activeChips, clearAll } = filters
  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {config.map((control, i) => (
          <Control key={i} control={control} filters={filters} />
        ))}
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>

      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Funnel className="w-4 h-4 text-gray-400 shrink-0" />
          {activeChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={chip.onRemove}
              className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
            >
              <span>{chip.label}</span>
              <X className="w-3 h-3" />
            </button>
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}
