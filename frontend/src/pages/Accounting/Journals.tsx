import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Scroll } from '@phosphor-icons/react'
import { journalsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { useDebounce } from '@/lib/utils'
import {
  Button,
  DataTable,
  PageHeader,
  RefreshingOverlay,
  refreshingContentClass,
  StatusBadge,
  type Column,
} from '@/components/ui'
import type { Journal, Paginated } from '@/types/accounting'

export default function Journals() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const statusFilter = searchParams.get('status') ?? ''
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search, 300)

  const { data, isFetching } = useQuery({
    queryKey: qk.journals.list({ page, search: debouncedSearch, status: statusFilter }),
    queryFn: () =>
      journalsApi
        .list({ page, search: debouncedSearch || undefined, status: statusFilter || undefined })
        .then((r) => r.data as Paginated<Journal>),
    placeholderData: keepPreviousData,
  })
  const isRefreshing = isFetching && !!data

  const columns: Column<Journal>[] = [
    { key: 'number', header: 'Number', render: (j) => <span className="font-mono text-primary-600 dark:text-primary-400">{j.number}</span> },
    { key: 'date', header: 'Date' },
    { key: 'journal_type', header: 'Type' },
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
          <Button onClick={() => navigate('/app/journals/new')}>
            <Plus className="w-4 h-4 mr-2" /> Manual Journal
          </Button>
        }
      />

      <div className="flex gap-2">
        {['', 'draft', 'posted', 'reversed'].map((s) => (
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

      <div className="relative">
        <RefreshingOverlay active={isRefreshing} />
        <div className={refreshingContentClass(isRefreshing)}>
          <DataTable<Journal>
            rowKey={(j) => j.id}
            columns={columns}
            data={data?.results ?? []}
            loading={!data}
            searchable
            searchValue={search}
            onSearch={(q) => { setSearch(q); setPage(1) }}
            searchPlaceholder="Search number, description, reference…"
            onRowClick={(j) => navigate(`/app/journals/${j.id}`)}
            emptyTitle="No journals found"
            pagination={{
              page,
              pageSize: 25,
              total: data?.count ?? 0,
              onPageChange: setPage,
            }}
          />
        </div>
      </div>
    </div>
  )
}
