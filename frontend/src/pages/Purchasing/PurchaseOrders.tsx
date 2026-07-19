import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, ShoppingCart } from '@phosphor-icons/react'
import { purchaseOrdersApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { useDebounce } from '@/lib/utils'
import { Badge, Button, DataTable, PageHeader, StatusBadge, type Column } from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import { PO_STATUSES, money, type PurchaseOrder } from '@/types/procurement'

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  approved: 'Approved',
  partially_received: 'Partially received',
  received: 'Received',
  closed: 'Closed',
  cancelled: 'Cancelled',
}

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
  const [searchParams, setSearchParams] = useSearchParams()
  const statusFilter = searchParams.get('status') ?? ''
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search, 300)

  const { data, isLoading } = useQuery({
    queryKey: qk.purchaseOrders.list({ page, search: debouncedSearch, status: statusFilter }),
    queryFn: () =>
      purchaseOrdersApi
        .list({ page, search: debouncedSearch || undefined, status: statusFilter || undefined })
        .then((r) => r.data as Paginated<PurchaseOrder>),
    placeholderData: keepPreviousData,
  })

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
        actions={
          <Button onClick={() => navigate('/app/purchase-orders/new')}>
            <Plus className="w-4 h-4 mr-2" /> New PO
          </Button>
        }
      />

      <div className="flex gap-2 flex-wrap">
        {['', ...PO_STATUSES].map((s) => (
          <button
            key={s}
            onClick={() => {
              const next = new URLSearchParams(searchParams)
              if (s) next.set('status', s)
              else next.delete('status')
              setSearchParams(next, { replace: true })
              setPage(1)
            }}
            className={`px-3 py-1.5 text-sm rounded-full border ${
              statusFilter === s
                ? 'bg-primary-600 text-white border-primary-600'
                : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            {s ? STATUS_LABELS[s] : 'All'}
          </button>
        ))}
      </div>

      <DataTable<PurchaseOrder>
        rowKey={(po) => po.id}
        columns={columns}
        data={data?.results ?? []}
        loading={isLoading}
        searchable
        searchValue={search}
        onSearch={(q) => { setSearch(q); setPage(1) }}
        searchPlaceholder="Search number, supplier…"
        onRowClick={(po) => navigate(`/app/purchase-orders/${po.id}`)}
        emptyTitle="No purchase orders"
        emptyAction={{ label: 'Create your first PO', onClick: () => navigate('/app/purchase-orders/new') }}
        pagination={{
          page,
          pageSize: 25,
          total: data?.count ?? 0,
          onPageChange: setPage,
        }}
      />
    </div>
  )
}
