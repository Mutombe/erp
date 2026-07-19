import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { FileText, Plus } from '@phosphor-icons/react'
import { vendorBillsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { useDebounce } from '@/lib/utils'
import { Button, DataTable, PageHeader, StatusBadge, type Column } from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import { BILL_STATUSES, money, type VendorBill } from '@/types/procurement'

export default function VendorBills() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const statusFilter = searchParams.get('status') ?? ''
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search, 300)

  const { data, isLoading } = useQuery({
    queryKey: qk.vendorBills.list({ page, search: debouncedSearch, status: statusFilter }),
    queryFn: () =>
      vendorBillsApi
        .list({ page, search: debouncedSearch || undefined, status: statusFilter || undefined })
        .then((r) => r.data as Paginated<VendorBill>),
    placeholderData: keepPreviousData,
  })

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
        actions={
          <Button onClick={() => navigate('/app/vendor-bills/new')}>
            <Plus className="w-4 h-4 mr-2" /> New Bill
          </Button>
        }
      />

      <div className="flex gap-2 flex-wrap">
        {['', ...BILL_STATUSES].map((s) => (
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
            {s || 'All'}
          </button>
        ))}
      </div>

      <DataTable<VendorBill>
        rowKey={(b) => b.id}
        columns={columns}
        data={data?.results ?? []}
        loading={isLoading}
        searchable
        searchValue={search}
        onSearch={(q) => { setSearch(q); setPage(1) }}
        searchPlaceholder="Search number, supplier ref, supplier…"
        onRowClick={(b) => navigate(`/app/vendor-bills/${b.id}`)}
        emptyTitle="No vendor bills"
        emptyAction={{ label: 'Capture your first bill', onClick: () => navigate('/app/vendor-bills/new') }}
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
