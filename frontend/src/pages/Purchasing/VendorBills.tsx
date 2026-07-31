import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FileText, Plus } from '@phosphor-icons/react'
import { suppliersApi, vendorBillsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { usePagedList } from '@/hooks/usePaginatedQuery'
import { usePrefetchDetail } from '@/hooks/usePrefetch'
import { useUrlFilters, filtersToQuery, type FilterConfig } from '@/hooks/useUrlFilters'
import { useCan } from '@/hooks/useCan'
import { Button, DataTable, FilterBar, PageHeader, RefreshingOverlay, StatusBadge, refreshingContentClass, type Column } from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import { BILL_STATUSES, money, type VendorBill } from '@/types/procurement'

const PAGE_SIZE = 25

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  posted: 'Posted',
  partial: 'Partial',
  paid: 'Paid',
  cancelled: 'Cancelled',
}

const STATUS_OPTIONS = BILL_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD' },
  { value: 'ZWG', label: 'ZWG' },
]

const FILTER_CONFIG: FilterConfig = [
  { type: 'search', placeholder: 'Search number, supplier ref, supplier…' },
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
  { type: 'dateRange', field: 'due_date', label: 'Due' },
  { type: 'amountRange', field: 'total', label: 'Total' },
]

export default function VendorBills() {
  const navigate = useNavigate()
  const canCreate = useCan('procurement', 'create')
  const filters = useUrlFilters(FILTER_CONFIG)
  const [page, setPage] = useState(1)

  const filterSignature = JSON.stringify(filters.params)
  useEffect(() => {
    setPage(1)
  }, [filterSignature])

  const { data, results, total, isFetching } = usePagedList<VendorBill>({
    keyFor: (p) => qk.vendorBills.list({ ...filters.params, page: p }),
    fetchPage: (p) =>
      vendorBillsApi.list(filtersToQuery(filters.params, { page: p })).then((r) => r.data as Paginated<VendorBill>),
    page,
    pageSize: PAGE_SIZE,
  })
  const isRefreshing = isFetching && !!data

  const prefetchVendorBill = usePrefetchDetail<VendorBill>(
    (b) => qk.vendorBills.detail(b.id),
    (b) => vendorBillsApi.get(b.id).then((r) => r.data)
  )

  const columns: Column<VendorBill>[] = [
    { key: 'number', header: 'Number', render: (b) => <span className="font-mono text-primary-600 dark:text-primary-400">{b.number}</span> },
    { key: 'supplier_reference', header: 'Supplier ref', render: (b) => b.supplier_reference || '—' },
    { key: 'date', header: 'Date' },
    { key: 'due_date', header: 'Due' },
    {
      key: 'supplier',
      header: 'Supplier',
      render: (b) => (
        <Link
          to={`/app/suppliers/${b.supplier}`}
          onClick={(e) => e.stopPropagation()}
          className="text-primary-600 dark:text-primary-400 hover:underline"
        >
          {b.supplier_name}
        </Link>
      ),
    },
    { key: 'currency', header: 'Ccy' },
    { key: 'total', header: 'Total', align: 'right', render: (b) => <span className="tabular-nums">{money(b.total)}</span> },
    { key: 'balance', header: 'Balance', align: 'right', render: (b) => <span className="tabular-nums">{money(b.balance)}</span> },
    { key: 'status', header: 'Status', render: (b) => <StatusBadge status={b.status} /> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendor Bills"
        description="Supplier invoices — post to raise the payable, then pay"
        icon={FileText}
        actions={canCreate ? (
          <Button onClick={() => navigate('/app/vendor-bills/new')}>
            <Plus className="w-4 h-4 mr-2" /> New Bill
          </Button>
        ) : undefined}
      />

      <FilterBar config={FILTER_CONFIG} filters={filters} />

      <div className="relative">
        <RefreshingOverlay active={isRefreshing} />
        <div className={refreshingContentClass(isRefreshing)}>
          <DataTable<VendorBill>
            rowKey={(b) => b.id}
            columns={columns}
            data={results}
            loading={!data}
            onRowClick={(b) => navigate(`/app/vendor-bills/${b.id}`)}
            onRowHover={prefetchVendorBill}
            emptyTitle="No vendor bills"
            emptyAction={{ label: 'Capture your first bill', onClick: () => navigate('/app/vendor-bills/new') }}
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
