import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { qk } from '@/lib/queryKeys'
import {
  accountsApi,
  bankAccountsApi,
  feeCategoriesApi,
  gradesApi,
  termsApi,
  departmentsApi,
  warehousesApi,
  itemCategoriesApi,
  suppliersApi,
} from '@/services/api'

/** Options stay "fresh" for 5 min after warming — plenty to cover the first
 *  dropdown open / optimistic label lookup without an extra round-trip. */
const OPTIONS_STALE_TIME = 5 * 60 * 1000

/**
 * Each warmer targets the EXACT query key + shape the real dropdown consumers
 * read (verified against their `useQuery` calls), so a warmed entry is an
 * actual cache hit rather than a near-miss.
 */
const warmers: { queryKey: ReturnType<typeof qk.accounts.list>; queryFn: () => Promise<unknown> }[] = [
  { queryKey: qk.accounts.list({ is_active: true }), queryFn: () => accountsApi.list({ is_active: true, page_size: 500 }).then((r) => r.data.results ?? r.data) },
  { queryKey: qk.bankAccounts.list(), queryFn: () => bankAccountsApi.list({ page_size: 500 }).then((r) => r.data.results ?? r.data) },
  { queryKey: qk.feeCategories.list({ active: true }), queryFn: () => feeCategoriesApi.list({ is_active: true, page_size: 500 }).then((r) => r.data.results ?? r.data) },
  { queryKey: qk.grades.list(), queryFn: () => gradesApi.list({ page_size: 500 }).then((r) => r.data.results ?? r.data) },
  { queryKey: qk.terms.list(), queryFn: () => termsApi.list().then((r) => r.data) },
  { queryKey: qk.departments.list({ is_active: true }), queryFn: () => departmentsApi.list({ is_active: true, page_size: 500 }).then((r) => r.data.results ?? r.data) },
  { queryKey: qk.warehouses.list({ is_active: true }), queryFn: () => warehousesApi.list({ is_active: true, page_size: 500 }).then((r) => r.data.results ?? r.data) },
  { queryKey: qk.itemCategories.list(), queryFn: () => itemCategoriesApi.list({ page_size: 500 }).then((r) => r.data.results ?? r.data) },
  {
    queryKey: qk.suppliers.list({ for: 'select' }),
    queryFn: () => suppliersApi.list({ is_active: true, page_size: 500 }).then((r) => (r.data as { results: unknown[] }).results),
  },
]

/**
 * Mounted once inside the app shell. On mount it prefetches the common dropdown
 * option lists (accounts, banks, fee categories, grades, terms, departments,
 * warehouses, item categories, suppliers) into their list query keys, so the
 * first time any form opens a dropdown — or an optimistic row needs a label —
 * the data is already in cache. Renders nothing.
 */
export default function CacheWarmer() {
  const queryClient = useQueryClient()

  useEffect(() => {
    for (const { queryKey, queryFn } of warmers) {
      queryClient.prefetchQuery({ queryKey, queryFn, staleTime: OPTIONS_STALE_TIME })
    }
    // Run exactly once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
