import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Scroll } from '@phosphor-icons/react'
import { journalsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { usePagedList } from '@/hooks/usePaginatedQuery'
import { usePrefetchDetail } from '@/hooks/usePrefetch'
import { useUrlFilters, filtersToQuery, type FilterConfig } from '@/hooks/useUrlFilters'
import { useCan } from '@/hooks/useCan'
import {
  Button,
  DataTable,
  FilterBar,
  PageHeader,
  RefreshingOverlay,
  refreshingContentClass,
  StatusBadge,
  type Column,
} from '@/components/ui'
import type { Journal, Paginated } from '@/types/accounting'

const PAGE_SIZE = 25

// Static (stable identity — defined at module scope so filter hooks don't churn).
const JOURNAL_TYPE_OPTIONS = [
  { value: 'general', label: 'General' },
  { value: 'sales', label: 'Sales' },
  { value: 'receipts', label: 'Receipts' },
  { value: 'payments', label: 'Payments' },
  { value: 'purchases', label: 'Purchases' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'depreciation', label: 'Depreciation' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'reversal', label: 'Reversal' },
  { value: 'opening', label: 'Opening' },
]

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'posted', label: 'Posted' },
  { value: 'reversed', label: 'Reversed' },
]

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD' },
  { value: 'ZWG', label: 'ZWG' },
]

// The reference FilterConfig — search, multi-select type, status chips, currency
// select, a date range and an amount range, all URL-persisted.
const FILTER_CONFIG: FilterConfig = [
  { type: 'search', placeholder: 'Search number, description, reference…' },
  { type: 'select', field: 'journal_type', label: 'Type', multi: true, searchable: true, options: JOURNAL_TYPE_OPTIONS },
  { type: 'chips', field: 'status', label: 'Status', options: STATUS_OPTIONS },
  { type: 'select', field: 'currency', label: 'Currency', options: CURRENCY_OPTIONS },
  { type: 'dateRange', field: 'date', label: 'Date' },
  { type: 'amountRange', field: 'total', label: 'Amount' },
]

export default function Journals() {
  const navigate = useNavigate()
  const filters = useUrlFilters(FILTER_CONFIG)
  const [page, setPage] = useState(1)
  const canCreate = useCan('accounting', 'create')

  // Any filter change returns to page 1 (keepPreviousData keeps the old rows on
  // screen so this never blanks the table).
  const filterSignature = JSON.stringify(filters.params)
  useEffect(() => {
    setPage(1)
  }, [filterSignature])

  const { data, results, total, isFetching } = usePagedList<Journal>({
    keyFor: (p) => qk.journals.list({ ...filters.params, page: p }),
    fetchPage: (p) =>
      journalsApi.list(filtersToQuery(filters.params, { page: p })).then((r) => r.data as Paginated<Journal>),
    page,
    pageSize: PAGE_SIZE,
  })
  const isRefreshing = isFetching && !!data

  // Warm the journal detail cache on row hover so opening a journal is instant.
  const prefetchJournal = usePrefetchDetail<Journal>(
    (j) => qk.journals.detail(j.id),
    (j) => journalsApi.get(j.id).then((r) => r.data)
  )

  const columns: Column<Journal>[] = [
    { key: 'number', header: 'Number', render: (j) => <span className="font-mono text-primary-600 dark:text-primary-400">{j.number}</span> },
    { key: 'date', header: 'Date' },
    { key: 'journal_type', header: 'Type', render: (j) => <span className="capitalize">{j.journal_type}</span> },
    { key: 'description', header: 'Description', render: (j) => <span className="block max-w-md truncate">{j.description}</span> },
    { key: 'currency', header: 'Ccy' },
    { key: 'total_debit', header: 'Amount', align: 'right', render: (j) => <span className="tabular-nums">{parseFloat(j.total_debit).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> },
    { key: 'status', header: 'Status', render: (j) => <StatusBadge status={j.status} /> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Journal Entries"
        description="Every posting in the system — documents and manual journals"
        icon={Scroll}
        actions={
          canCreate ? (
            <Button onClick={() => navigate('/app/journals/new')}>
              <Plus className="w-4 h-4 mr-2" /> Manual Journal
            </Button>
          ) : undefined
        }
      />

      <FilterBar config={FILTER_CONFIG} filters={filters} />

      <div className="relative">
        <RefreshingOverlay active={isRefreshing} />
        <div className={refreshingContentClass(isRefreshing)}>
          <DataTable<Journal>
            rowKey={(j) => j.id}
            columns={columns}
            data={results}
            loading={!data}
            onRowClick={(j) => navigate(`/app/journals/${j.id}`)}
            onRowHover={prefetchJournal}
            emptyTitle="No journals found"
            emptyDescription="No journals match the current filters."
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
