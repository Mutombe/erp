import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlayCircle, Plus } from '@phosphor-icons/react'
import { billingRunsApi, termsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { usePagedList } from '@/hooks/usePaginatedQuery'
import { usePrefetchDetail } from '@/hooks/usePrefetch'
import { useUrlFilters, filtersToQuery, type FilterConfig } from '@/hooks/useUrlFilters'
import { useCan } from '@/hooks/useCan'
import { Button, DataTable, FilterBar, PageHeader, RefreshingOverlay, StatusBadge, refreshingContentClass, type Column } from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import { fmtMoney, type BillingRun } from '@/types/fees'

const PAGE_SIZE = 25

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'previewed', label: 'Previewed' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
]

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD' },
  { value: 'ZWG', label: 'ZWG' },
]

const FILTER_CONFIG: FilterConfig = [
  { type: 'chips', field: 'status', label: 'Status', options: STATUS_OPTIONS },
  {
    type: 'select',
    field: 'term',
    label: 'Term',
    searchable: true,
    query: {
      queryKey: ['terms', 'facet-options'],
      queryFn: () => termsApi.list({ page_size: 500 }).then((r) => (r.data.results ?? r.data) as any[]),
      toOption: (row) => ({ value: String(row.id), label: row.name }),
    },
  },
  { type: 'chips', field: 'currency', label: 'Currency', options: CURRENCY_OPTIONS },
  { type: 'dateRange', field: 'date', label: 'Date' },
]

export default function BillingRuns() {
  const navigate = useNavigate()
  const filters = useUrlFilters(FILTER_CONFIG)
  const [page, setPage] = useState(1)
  const canCreate = useCan('fees', 'create')

  const filterSignature = JSON.stringify(filters.params)
  useEffect(() => {
    setPage(1)
  }, [filterSignature])

  const { data, results, total, isFetching } = usePagedList<BillingRun>({
    keyFor: (p) => qk.billingRuns.list({ ...filters.params, page: p }),
    fetchPage: (p) =>
      billingRunsApi.list(filtersToQuery(filters.params, { page: p })).then((r) => r.data as Paginated<BillingRun>),
    page,
    pageSize: PAGE_SIZE,
  })
  const isRefreshing = isFetching && !!data

  // Warm the billing-run detail cache on row hover so opening a run is instant.
  const prefetchRun = usePrefetchDetail<BillingRun>(
    (b) => qk.billingRuns.detail(b.id),
    (b) => billingRunsApi.get(b.id).then((r) => r.data)
  )

  const columns: Column<BillingRun>[] = [
    { key: 'number', header: 'Number', render: (b) => <span className="font-mono text-primary-600 dark:text-primary-400">{b.number}</span> },
    { key: 'term_name', header: 'Term' },
    { key: 'currency', header: 'Ccy' },
    { key: 'date', header: 'Date' },
    { key: 'status', header: 'Status', render: (b) => <StatusBadge status={b.status} /> },
    { key: 'invoices_created', header: 'Invoices', align: 'right', render: (b) => <span className="tabular-nums">{b.invoices_created}</span> },
    { key: 'total_billed', header: 'Total billed', align: 'right', render: (b) => <span className="tabular-nums">{fmtMoney(b.total_billed)}</span> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing Runs"
        description="Bulk termly invoicing — preview, then execute to post fee invoices"
        icon={PlayCircle}
        actions={
          canCreate ? (
            <Button onClick={() => navigate('/app/billing-runs/new')}>
              <Plus className="w-4 h-4 mr-2" /> New Billing Run
            </Button>
          ) : undefined
        }
      />

      <FilterBar config={FILTER_CONFIG} filters={filters} />

      <div className="relative">
        <RefreshingOverlay active={isRefreshing} />
        <div className={refreshingContentClass(isRefreshing)}>
          <DataTable<BillingRun>
            rowKey={(b) => b.id}
            columns={columns}
            data={results}
            loading={!data}
            onRowClick={(b) => navigate(`/app/billing-runs/${b.id}`)}
            onRowHover={prefetchRun}
            emptyTitle="No billing runs"
            emptyDescription="No billing runs match the current filters."
            pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
          />
        </div>
      </div>
    </div>
  )
}
