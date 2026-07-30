import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BoxArrowDown } from '@phosphor-icons/react'
import { grnsApi, purchaseOrdersApi, suppliersApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { usePagedList } from '@/hooks/usePaginatedQuery'
import { usePrefetchDetail } from '@/hooks/usePrefetch'
import { useUrlFilters, filtersToQuery, type FilterConfig } from '@/hooks/useUrlFilters'
import { DataTable, FilterBar, PageHeader, RefreshingOverlay, StatusBadge, refreshingContentClass, type Column } from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import type { GRN } from '@/types/procurement'

const PAGE_SIZE = 25

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'posted', label: 'Posted' },
]

const FILTER_CONFIG: FilterConfig = [
  { type: 'chips', field: 'status', label: 'Status', options: STATUS_OPTIONS },
  {
    type: 'select',
    field: 'po',
    label: 'Purchase order',
    searchable: true,
    query: {
      queryKey: ['purchaseOrders', 'facet-options'],
      queryFn: () => purchaseOrdersApi.list({ page_size: 500 }).then((r) => (r.data.results ?? r.data) as any[]),
      toOption: (row) => ({ value: String(row.id), label: row.number }),
    },
  },
  {
    type: 'select',
    field: 'supplier',
    label: 'Supplier',
    searchable: true,
    query: {
      queryKey: ['suppliers', 'facet-options'],
      queryFn: () => suppliersApi.list({ page_size: 500 }).then((r) => (r.data.results ?? r.data) as any[]),
      toOption: (row) => ({ value: String(row.id), label: `${row.code} · ${row.name}` }),
    },
  },
  { type: 'dateRange', field: 'date', label: 'Date' },
]

export default function GRNs() {
  const navigate = useNavigate()
  const filters = useUrlFilters(FILTER_CONFIG)
  const [page, setPage] = useState(1)

  const filterSignature = JSON.stringify(filters.params)
  useEffect(() => {
    setPage(1)
  }, [filterSignature])

  const { data, results, total, isFetching } = usePagedList<GRN>({
    keyFor: (p) => qk.grns.list({ ...filters.params, page: p }),
    fetchPage: (p) =>
      grnsApi.list(filtersToQuery(filters.params, { page: p })).then((r) => r.data as Paginated<GRN>),
    page,
    pageSize: PAGE_SIZE,
  })
  const isRefreshing = isFetching && !!data

  const prefetchGrn = usePrefetchDetail<GRN>(
    (g) => qk.grns.detail(g.id),
    (g) => grnsApi.get(g.id).then((r) => r.data)
  )

  const columns: Column<GRN>[] = [
    { key: 'number', header: 'Number', render: (g) => <span className="font-mono text-primary-600 dark:text-primary-400">{g.number}</span> },
    { key: 'date', header: 'Date' },
    {
      key: 'po',
      header: 'Purchase order',
      render: (g) => (
        <Link
          to={`/app/purchase-orders/${g.po}`}
          onClick={(e) => e.stopPropagation()}
          className="text-primary-600 dark:text-primary-400 hover:underline font-mono"
        >
          {g.po_number}
        </Link>
      ),
    },
    { key: 'warehouse_code', header: 'Warehouse', render: (g) => <span className="font-mono">{g.warehouse_code}</span> },
    {
      key: 'journal',
      header: 'Journal',
      render: (g) =>
        g.journal ? (
          <Link
            to={`/app/journals/${g.journal}`}
            onClick={(e) => e.stopPropagation()}
            className="text-primary-600 dark:text-primary-400 hover:underline font-mono"
          >
            {g.journal_number}
          </Link>
        ) : (
          '—'
        ),
    },
    { key: 'status', header: 'Status', render: (g) => <StatusBadge status={g.status} /> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Goods Received Notes"
        description="Deliveries received against approved purchase orders"
        icon={BoxArrowDown}
      />

      <FilterBar config={FILTER_CONFIG} filters={filters} />

      <div className="relative">
        <RefreshingOverlay active={isRefreshing} />
        <div className={refreshingContentClass(isRefreshing)}>
          <DataTable<GRN>
            rowKey={(g) => g.id}
            columns={columns}
            data={results}
            loading={!data}
            onRowClick={(g) => navigate(`/app/grns/${g.id}`)}
            onRowHover={prefetchGrn}
            emptyTitle="No goods received notes"
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
