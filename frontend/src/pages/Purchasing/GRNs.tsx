import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { BoxArrowDown } from '@phosphor-icons/react'
import { grnsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { useDebounce } from '@/lib/utils'
import { DataTable, PageHeader, StatusBadge, type Column } from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import type { GRN } from '@/types/procurement'

export default function GRNs() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const statusFilter = searchParams.get('status') ?? ''
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search, 300)

  const { data, isLoading } = useQuery({
    queryKey: qk.grns.list({ page, search: debouncedSearch, status: statusFilter }),
    queryFn: () =>
      grnsApi
        .list({ page, search: debouncedSearch || undefined, status: statusFilter || undefined })
        .then((r) => r.data as Paginated<GRN>),
    placeholderData: keepPreviousData,
  })

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

      <div className="flex gap-2">
        {['', 'draft', 'posted'].map((s) => (
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

      <DataTable<GRN>
        rowKey={(g) => g.id}
        columns={columns}
        data={data?.results ?? []}
        loading={isLoading}
        searchable
        searchValue={search}
        onSearch={(q) => { setSearch(q); setPage(1) }}
        searchPlaceholder="Search GRN or PO number…"
        onRowClick={(g) => navigate(`/app/grns/${g.id}`)}
        emptyTitle="No goods received notes"
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
