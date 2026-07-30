import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { QueryKey } from '@tanstack/react-query'
import { useDebounce } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Declarative filter config
// ---------------------------------------------------------------------------

export interface FilterOption {
  value: string
  label: string
}

/** Load a facet's options from a query instead of a static list. */
export interface FilterOptionQuery {
  queryKey: QueryKey
  queryFn: () => Promise<unknown[]>
  /** Map a fetched row to a { value, label } option. */
  toOption: (row: any) => FilterOption
}

export type FilterControl =
  /** Debounced free-text search → `?search=`. */
  | { type: 'search'; placeholder?: string }
  /** Status pills / segmented control → `?field=` (single) or `?field__in=a,b` (multi). */
  | { type: 'chips'; field: string; label?: string; multi?: boolean; options: FilterOption[] }
  /** Dropdown facet → `?field=` (single) or `?field__in=a,b` (multi). Options static or from a query. */
  | {
      type: 'select'
      field: string
      label?: string
      multi?: boolean
      placeholder?: string
      searchable?: boolean
      options?: FilterOption[]
      query?: FilterOptionQuery
    }
  /** Two date inputs → `?field__gte=` / `?field__lte=`. */
  | { type: 'dateRange'; field: string; label?: string }
  /** Two number inputs → `?field__gte=` / `?field__lte=`. */
  | { type: 'amountRange'; field: string; label?: string; step?: string; placeholder?: [string, string] }
  /** Toggle → `?field=true` / `?field=false`. */
  | { type: 'boolean'; field: string; label: string }

export type FilterConfig = FilterControl[]

export interface ActiveChip {
  id: string
  label: string
  onRemove: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEARCH_PARAM = 'search'

const inParam = (field: string) => `${field}__in`
const gteParam = (field: string) => `${field}__gte`
const lteParam = (field: string) => `${field}__lte`

function humanize(field: string): string {
  const spaced = field.replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function controlLabel(c: Extract<FilterControl, { field: string }>): string {
  return ('label' in c && c.label) || humanize(c.field)
}

function optionLabel(options: FilterOption[] | undefined, value: string): string {
  return options?.find((o) => o.value === value)?.label ?? value
}

/** Every backend param name a control can own — used by `clearAll`. */
function ownedParams(c: FilterControl): string[] {
  switch (c.type) {
    case 'search':
      return [SEARCH_PARAM]
    case 'chips':
    case 'select':
      return c.multi ? [inParam(c.field)] : [c.field]
    case 'dateRange':
    case 'amountRange':
      return [gteParam(c.field), lteParam(c.field)]
    case 'boolean':
      return [c.field]
  }
}

/**
 * Reads/writes declarative filter state to the URL query string so every
 * filtered view is shareable, bookmarkable and survives back/forward. Filter
 * values are stored under the exact backend param names (`field`, `field__in`,
 * `field__gte`/`__lte`) so `params` doubles as the API query object and the
 * TanStack Query key.
 *
 * The free-text search is debounced (~300ms) before it lands in the URL — and
 * therefore before it changes the query key — so typing doesn't spam refetches.
 */
export function useUrlFilters(config: FilterConfig) {
  const [searchParams, setSearchParams] = useSearchParams()

  const hasSearch = useMemo(() => config.some((c) => c.type === 'search'), [config])
  const allOwned = useMemo(() => config.flatMap(ownedParams), [config])

  // --- Search: local input state, debounced into the URL --------------------
  const [searchInput, setSearchInput] = useState(() => searchParams.get(SEARCH_PARAM) ?? '')
  const debouncedSearch = useDebounce(searchInput, 300)
  const lastWritten = useRef<string | null>(searchParams.get(SEARCH_PARAM) ?? '')

  useEffect(() => {
    if (!hasSearch) return
    const current = searchParams.get(SEARCH_PARAM) ?? ''
    if (debouncedSearch === current) return
    lastWritten.current = debouncedSearch
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (debouncedSearch) next.set(SEARCH_PARAM, debouncedSearch)
        else next.delete(SEARCH_PARAM)
        return next
      },
      { replace: true }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, hasSearch])

  // Re-sync the input when the URL changes underneath us (back/forward, clearAll)
  // — but never fight a value we just wrote.
  useEffect(() => {
    const urlSearch = searchParams.get(SEARCH_PARAM) ?? ''
    if (urlSearch !== searchInput && urlSearch !== lastWritten.current) {
      setSearchInput(urlSearch)
      lastWritten.current = urlSearch
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // --- Backend-param-named object (query object + query key) ----------------
  const params = useMemo(() => {
    const obj: Record<string, string> = {}
    searchParams.forEach((value, key) => {
      obj[key] = value
    })
    return obj
  }, [searchParams])

  // --- Mutators -------------------------------------------------------------
  const setParam = useCallback(
    (name: string, value: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (value === '' || value == null) next.delete(name)
          else next.set(name, value)
          return next
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  const removeParam = useCallback(
    (name: string) => {
      if (name === SEARCH_PARAM) {
        setSearchInput('')
        lastWritten.current = ''
      }
      setParam(name, '')
    },
    [setParam]
  )

  /** Set the full value list of a `field__in` multi facet. */
  const setMulti = useCallback(
    (field: string, values: string[]) => {
      setParam(inParam(field), values.filter(Boolean).join(','))
    },
    [setParam]
  )

  /** Toggle a single value inside a `field__in` multi facet. */
  const toggleMulti = useCallback(
    (field: string, value: string) => {
      const current = (params[inParam(field)] ?? '').split(',').filter(Boolean)
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value]
      setMulti(field, next)
    },
    [params, setMulti]
  )

  const clearAll = useCallback(() => {
    setSearchInput('')
    lastWritten.current = ''
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const name of allOwned) next.delete(name)
        return next
      },
      { replace: true }
    )
  }, [allOwned, setSearchParams])

  // --- Removable active-filter chips ----------------------------------------
  const activeChips = useMemo<ActiveChip[]>(() => {
    const chips: ActiveChip[] = []
    for (const c of config) {
      switch (c.type) {
        case 'search': {
          const v = params[SEARCH_PARAM]
          if (v) chips.push({ id: SEARCH_PARAM, label: `Search: "${v}"`, onRemove: () => removeParam(SEARCH_PARAM) })
          break
        }
        case 'chips':
        case 'select': {
          const label = controlLabel(c)
          if (c.multi) {
            const raw = params[inParam(c.field)]
            if (raw)
              raw
                .split(',')
                .filter(Boolean)
                .forEach((val) =>
                  chips.push({
                    id: `${c.field}:${val}`,
                    label: `${label}: ${optionLabel(c.options, val)}`,
                    onRemove: () => toggleMulti(c.field, val),
                  })
                )
          } else {
            const val = params[c.field]
            if (val)
              chips.push({
                id: c.field,
                label: `${label}: ${optionLabel(c.options, val)}`,
                onRemove: () => removeParam(c.field),
              })
          }
          break
        }
        case 'dateRange': {
          const label = controlLabel(c)
          const gte = params[gteParam(c.field)]
          const lte = params[lteParam(c.field)]
          if (gte) chips.push({ id: gteParam(c.field), label: `${label} ≥ ${gte}`, onRemove: () => removeParam(gteParam(c.field)) })
          if (lte) chips.push({ id: lteParam(c.field), label: `${label} ≤ ${lte}`, onRemove: () => removeParam(lteParam(c.field)) })
          break
        }
        case 'amountRange': {
          const label = controlLabel(c)
          const gte = params[gteParam(c.field)]
          const lte = params[lteParam(c.field)]
          if (gte) chips.push({ id: gteParam(c.field), label: `${label} ≥ ${gte}`, onRemove: () => removeParam(gteParam(c.field)) })
          if (lte) chips.push({ id: lteParam(c.field), label: `${label} ≤ ${lte}`, onRemove: () => removeParam(lteParam(c.field)) })
          break
        }
        case 'boolean': {
          const val = params[c.field]
          if (val === 'true' || val === 'false')
            chips.push({ id: c.field, label: `${c.label}: ${val === 'true' ? 'Yes' : 'No'}`, onRemove: () => removeParam(c.field) })
          break
        }
      }
    }
    return chips
  }, [config, params, removeParam, toggleMulti])

  return {
    /** Backend-param-named string map — feed to the API list call and query key. */
    params,
    setParam,
    removeParam,
    setMulti,
    toggleMulti,
    clearAll,
    activeChips,
    /** Immediate (un-debounced) search input value — bind to the search box. */
    searchValue: searchInput,
    setSearch: setSearchInput,
  }
}

/** Merge filter params with extra query args (e.g. `page`), dropping empties. */
export function filtersToQuery(
  params: Record<string, string>,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(params)) if (v !== '' && v != null) out[k] = v
  for (const [k, v] of Object.entries(extra)) if (v !== '' && v != null) out[k] = v
  return out
}

export type UseUrlFiltersReturn = ReturnType<typeof useUrlFilters>
