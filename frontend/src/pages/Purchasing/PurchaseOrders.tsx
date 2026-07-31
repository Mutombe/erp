import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, ShoppingCart } from '@phosphor-icons/react'
import { purchaseOrdersApi, suppliersApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { usePagedList } from '@/hooks/usePaginatedQuery'
import { usePrefetchDetail } from '@/hooks/usePrefetch'
import { useUrlFilters, filtersToQuery, type FilterConfig } from '@/hooks/useUrlFilters'
import { useCan } from '@/hooks/useCan'
import { Badge, Button, DataTable, FilterBar, PageHeader, RefreshingOverlay, StatusBadge, refreshingContentClass, type Column } from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import { PO_STATUSES, money, type PurchaseOrder } from '@/types/procurement'

const PAGE_SIZE = 25

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  approved: 'Approved',
  partially_received: 'Partially received',
  received: 'Received',
  closed: 'Closed',
  cancelled: 'Cancelled',
}

const STATUS_OPTIONS = PO_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD' },
  { value: 'ZWG', label: 'ZWG' },
]

const FILTER_CONFIG: FilterConfig = [
  { type: 'search', placeholder: 'Search number, supplier…' },
  { type: 'chips', field: 'status', label: 'Status', options: STATUS_OPTIONS },
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
  { type: 'chips', field: 'currency', label: 'Currency', options: CURRENCY_OPTIONS },
  { type: 'dateRange', field: 'date', label: 'Date' },
  { type: 'dateRange', field: 'expected_date', label: 'Expected' },
]

/** StatusBadge with PO-specific statuses it doesn't know about. */
export function PoStatusBadge({ status }: { status: string }) {
  if (status === 'partially_received') {
    return <Badge variant="warning" dot>Partially received</Badge>
  }
  if (status === 'submitted') {
    return <Badge variant="info" dot>Submitted</Badge>
  }
  return <StatusBadge status={status} />
}

export default function PurchaseOrders() {
  const navigate = useNavigate()
  const canCreate = useCan('procurement', 'create')
  const filters = useUrlFilters(FILTER_CONFIG)
  const [page, setPage] = useState(1)

  const filterSignature = JSON.stringify(filters.params)
  useEffect(() => {
    setPage(1)
  }, [filterSignature])

  const { data, results, total, isFetching } = usePagedList<PurchaseOrder>({
    keyFor: (p) => qk.purchaseOrders.list({ ...filters.params, page: p }),
    fetchPage: (p) =>
      purchaseOrdersApi.list(filtersToQuery(filters.params, { page: p })).then((r) => r.data as Paginated<PurchaseOrder>),
    page,
    pageSize: PAGE_SIZE,
  })
  const isRefreshing = isFetching && !!data

  const prefetchPurchaseOrder = usePrefetchDetail<PurchaseOrder>(
    (po) => qk.purchaseOrders.detail(po.id),
    (po) => purchaseOrdersApi.get(po.id).then((r) => r.data)
  )

  const columns: Column<PurchaseOrder>[] = [
    { key: 'number', header: 'Number', render: (po) => <span className="font-mono text-primary-600 dark:text-primary-400">{po.number}</span> },
    { key: 'date', header: 'Date' },
    {
      key: 'supplier',
      header: 'Supplier',
      render: (po) => (
        <Link
          to={`/app/suppliers/${po.supplier}`}
          onClick={(e) => e.stopPropagation()}
          className="text-primary-600 dark:text-primary-400 hover:underline"
        >
          {po.supplier_name}
        </Link>
      ),
    },
    { key: 'currency', header: 'Ccy' },
    { key: 'total', header: 'Total', align: 'right', render: (po) => <span className="tabular-nums">{money(po.total)}</span> },
    { key: 'status', header: 'Status', render: (po) => <PoStatusBadge status={po.status} /> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchase Orders"
        description="Draft → approve → receive goods → bill"
        icon={ShoppingCart}
        actions={canCreate ? (
          <Button onClick={() => navigate('/app/purchase-orders/new')}>
            <Plus className="w-4 h-4 mr-2" /> New PO
          </Button>
        ) : undefined}
      />

      <FilterBar config={FILTER_CONFIG} filters={filters} />

      <div className="relative">
        <RefreshingOverlay active={isRefreshing} />
        <div className={refreshingContentClass(isRefreshing)}>
          <DataTable<PurchaseOrder>
            rowKey={(po) => po.id}
            columns={columns}
            data={results}
            loading={!data}
            onRowClick={(po) => navigate(`/app/purchase-orders/${po.id}`)}
            onRowHover={prefetchPurchaseOrder}
            emptyTitle="No purchase orders"
            emptyAction={{ label: 'Create your first PO', onClick: () => navigate('/app/purchase-orders/new') }}
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
