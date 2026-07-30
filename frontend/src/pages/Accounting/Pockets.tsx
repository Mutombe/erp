import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Coins } from '@phosphor-icons/react'
import { feeCategoriesApi, subAccountsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { usePagedList } from '@/hooks/usePaginatedQuery'
import { useUrlFilters, filtersToQuery, type FilterConfig } from '@/hooks/useUrlFilters'
import {
  Badge,
  DataTable,
  FilterBar,
  PageHeader,
  RefreshingOverlay,
  refreshingContentClass,
  type Column,
} from '@/components/ui'
import type { Paginated } from '@/types/accounting'

const PAGE_SIZE = 25

interface SubAccount {
  id: number
  code: string
  name: string
  party_type: 'student' | 'supplier'
  student: number | null
  student_name: string | null
  supplier: number | null
  supplier_name: string | null
  category: string
  currency: string
  current_balance: number | string
  is_active: boolean
}

const money = (v: number | string) =>
  Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Category options loaded from the fee catalogue (codes match the sub-ledger's
// `category` field; supplier pockets use the reserved 'PAYABLE' code).
const CATEGORY_QUERY = {
  queryKey: qk.feeCategories.list({ scope: 'pockets' }),
  queryFn: () =>
    feeCategoriesApi.list({ is_active: true, page_size: 500 }).then((r) => (r.data.results ?? r.data) as unknown[]),
  toOption: (row: { code: string; name: string }) => ({ value: row.code, label: `${row.code} · ${row.name}` }),
}

const FILTER_CONFIG: FilterConfig = [
  { type: 'search', placeholder: 'Search code or name…' },
  {
    type: 'chips',
    field: 'party_type',
    label: 'Party',
    multi: true,
    options: [
      { value: 'student', label: 'Students' },
      { value: 'supplier', label: 'Suppliers' },
    ],
  },
  { type: 'select', field: 'category', label: 'Category', multi: true, searchable: true, query: CATEGORY_QUERY },
  {
    type: 'chips',
    field: 'currency',
    label: 'Currency',
    multi: true,
    options: [
      { value: 'USD', label: 'USD' },
      { value: 'ZWG', label: 'ZWG' },
    ],
  },
  { type: 'boolean', field: 'is_active', label: 'Active' },
]

export default function Pockets() {
  const navigate = useNavigate()
  const filters = useUrlFilters(FILTER_CONFIG)
  const [page, setPage] = useState(1)

  // Any filter change returns to page 1 (keepPreviousData keeps rows on screen).
  const filterSignature = JSON.stringify(filters.params)
  useEffect(() => {
    setPage(1)
  }, [filterSignature])

  const { data, results, total, isFetching } = usePagedList<SubAccount>({
    keyFor: (p) => qk.subAccounts.list({ ...filters.params, page: p }),
    fetchPage: (p) =>
      subAccountsApi.list(filtersToQuery(filters.params, { page: p })).then((r) => r.data as Paginated<SubAccount>),
    page,
    pageSize: PAGE_SIZE,
  })
  const isRefreshing = isFetching && !!data

  const columns: Column<SubAccount>[] = [
    {
      key: 'code',
      header: 'Code',
      render: (s) => <span className="font-mono text-primary-600 dark:text-primary-400">{s.code}</span>,
    },
    { key: 'name', header: 'Party', render: (s) => <span className="font-medium">{s.name}</span> },
    {
      key: 'party_type',
      header: 'Type',
      render: (s) => (
        <Badge variant={s.party_type === 'student' ? 'info' : 'default'}>
          {s.party_type === 'student' ? 'Student' : 'Supplier'}
        </Badge>
      ),
    },
    { key: 'category', header: 'Category', render: (s) => <span className="font-mono text-xs text-gray-500">{s.category}</span> },
    { key: 'currency', header: 'Ccy' },
    {
      key: 'current_balance',
      header: 'Balance',
      align: 'right',
      render: (s) => {
        const v = Number(s.current_balance)
        const cls = v > 0 ? 'text-red-600 dark:text-red-400' : v < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'
        return <span className={`tabular-nums font-medium ${cls}`}>{s.currency} {money(v)}</span>
      },
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pockets"
        description="Party sub-ledgers — a running-balance pocket per student × fee category and per supplier"
        icon={Coins}
      />

      <FilterBar config={FILTER_CONFIG} filters={filters} />

      <div className="relative">
        <RefreshingOverlay active={isRefreshing} />
        <div className={refreshingContentClass(isRefreshing)}>
          <DataTable<SubAccount>
            rowKey={(s) => s.id}
            columns={columns}
            data={results}
            loading={!data}
            onRowClick={(s) => navigate(`/app/pockets/${s.id}`)}
            emptyTitle="No pockets found"
            emptyDescription="No sub-ledger pockets match the current filters."
            pagination={{
              page,
              pageSize: PAGE_SIZE,
              total,
              onPageChange: setPage,
            }}
          />
        </div>
      </div>
    </div>
  )
}
