import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Receipt } from '@phosphor-icons/react'
import { creditNotesApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { usePagedList } from '@/hooks/usePaginatedQuery'
import { usePrefetchDetail } from '@/hooks/usePrefetch'
import { useUrlFilters, filtersToQuery, type FilterConfig } from '@/hooks/useUrlFilters'
import RecordLink from '@/components/RecordLink'
import {
  DataTable,
  FilterBar,
  PageHeader,
  RefreshingOverlay,
  StatusBadge,
  refreshingContentClass,
  type Column,
} from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import { fmtMoney, type CreditNote } from '@/types/fees'

const PAGE_SIZE = 25

const FILTER_CONFIG: FilterConfig = [
  { type: 'search', placeholder: 'Search number, student…' },
  {
    type: 'chips',
    field: 'status',
    label: 'Status',
    multi: true,
    options: [
      { value: 'draft', label: 'Draft' },
      { value: 'posted', label: 'Posted' },
    ],
  },
]

export default function CreditNotes() {
  const filters = useUrlFilters(FILTER_CONFIG)
  const navigate = useNavigate()
  const [page, setPage] = useState(1)

  const filterSignature = JSON.stringify(filters.params)
  useEffect(() => {
    setPage(1)
  }, [filterSignature])

  const { data, results, total, isFetching } = usePagedList<CreditNote>({
    keyFor: (p) => qk.creditNotes.list({ ...filters.params, page: p }),
    fetchPage: (p) =>
      creditNotesApi.list(filtersToQuery(filters.params, { page: p })).then((r) => r.data as Paginated<CreditNote>),
    page,
    pageSize: PAGE_SIZE,
  })
  const isRefreshing = isFetching && !!data

  const prefetch = usePrefetchDetail<CreditNote>(
    (c) => qk.creditNotes.detail(c.id),
    (c) => creditNotesApi.get(c.id).then((r) => r.data)
  )

  const columns: Column<CreditNote>[] = [
    { key: 'number', header: 'Number', render: (c) => <span className="font-mono text-primary-600 dark:text-primary-400">{c.number}</span> },
    { key: 'date', header: 'Date' },
    {
      key: 'student',
      header: 'Student',
      render: (c) => (
        <RecordLink to={`/app/students/${c.student}`}>
          <span className="font-mono">{c.student_code}</span> {c.student_name}
        </RecordLink>
      ),
    },
    {
      key: 'invoice',
      header: 'Invoice',
      render: (c) =>
        c.invoice ? (
          <RecordLink to={`/app/fee-invoices/${c.invoice}`} mono>{c.invoice_number}</RecordLink>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    { key: 'total', header: 'Total', align: 'right', render: (c) => <span className="tabular-nums">{fmtMoney(c.total)}</span> },
    { key: 'status', header: 'Status', render: (c) => <StatusBadge status={c.status} /> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Credit Notes"
        description="Reductions applied against student invoices — each posts its own reversing journal"
        icon={Receipt}
      />

      <FilterBar config={FILTER_CONFIG} filters={filters} />

      <div className="relative">
        <RefreshingOverlay active={isRefreshing} />
        <div className={refreshingContentClass(isRefreshing)}>
          <DataTable<CreditNote>
            rowKey={(c) => c.id}
            columns={columns}
            data={results}
            loading={!data}
            onRowClick={(c) => navigate(`/app/credit-notes/${c.id}`)}
            onRowHover={prefetch}
            emptyTitle="No credit notes"
            emptyDescription="Credit notes reduce a student's billed fees against a specific invoice."
            pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
          />
        </div>
      </div>
    </div>
  )
}
