import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PlayCircle, Plus } from 'lucide-react'
import { billingRunsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { useDebounce } from '@/lib/utils'
import { Button, DataTable, PageHeader, StatusBadge, type Column } from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import { fmtMoney, type BillingRun } from '@/types/fees'

const RUN_STATUSES = ['', 'draft', 'previewed', 'running', 'completed', 'failed']

export default function BillingRuns() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const statusFilter = searchParams.get('status') ?? ''
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search, 300)

  const { data, isLoading } = useQuery({
    queryKey: qk.billingRuns.list({ page, search: debouncedSearch, status: statusFilter }),
    queryFn: () =>
      billingRunsApi
        .list({ page, search: debouncedSearch || undefined, status: statusFilter || undefined })
        .then((r) => r.data as Paginated<BillingRun>),
    placeholderData: keepPreviousData,
  })

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
          <Button onClick={() => navigate('/app/billing-runs/new')}>
            <Plus className="w-4 h-4 mr-2" /> New Billing Run
          </Button>
        }
      />

      <div className="flex gap-2 flex-wrap">
        {RUN_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => {
              const next = new URLSearchParams(searchParams)
              if (s) next.set('status', s)
              else next.delete('status')
              setSearchParams(next, { replace: true })
              setPage(1)
            }}
            className={`px-3 py-1.5 text-sm rounded-full border capitalize ${
              statusFilter === s
                ? 'bg-primary-600 text-white border-primary-600'
                : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      <DataTable<BillingRun>
        rowKey={(b) => b.id}
        columns={columns}
        data={data?.results ?? []}
        loading={isLoading}
        searchable
        searchValue={search}
        onSearch={(q) => { setSearch(q); setPage(1) }}
        searchPlaceholder="Search run number…"
        onRowClick={(b) => navigate(`/app/billing-runs/${b.id}`)}
        emptyTitle="No billing runs"
        pagination={{ page, pageSize: 25, total: data?.count ?? 0, onPageChange: setPage }}
      />
    </div>
  )
}
