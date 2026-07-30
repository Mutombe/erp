import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { FileText } from '@phosphor-icons/react'
import { feeInvoicesApi, studentsApi, termsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { usePagedList } from '@/hooks/usePaginatedQuery'
import { usePrefetchDetail } from '@/hooks/usePrefetch'
import { useUrlFilters, filtersToQuery, type FilterConfig } from '@/hooks/useUrlFilters'
import { DataTable, FilterBar, PageHeader, RefreshingOverlay, StatusBadge, refreshingContentClass, type Column } from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import type { Term } from '@/types/students'
import { fmtMoney, type FeeInvoice } from '@/types/fees'

const PAGE_SIZE = 25

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'posted', label: 'Posted' },
  { value: 'partial', label: 'Partial' },
  { value: 'paid', label: 'Paid' },
  { value: 'cancelled', label: 'Cancelled' },
]

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD' },
  { value: 'ZWG', label: 'ZWG' },
]

const FILTER_CONFIG: FilterConfig = [
  { type: 'search', placeholder: 'Search invoice number…' },
  { type: 'chips', field: 'status', label: 'Status', multi: true, options: STATUS_OPTIONS },
  {
    type: 'select',
    field: 'student',
    label: 'Student',
    searchable: true,
    query: {
      queryKey: ['students', 'facet-options'],
      queryFn: () => studentsApi.list({ page_size: 500 }).then((r) => (r.data.results ?? r.data) as any[]),
      toOption: (row) => ({ value: String(row.id), label: `${row.code} · ${row.full_name}` }),
    },
  },
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
  { type: 'dateRange', field: 'due_date', label: 'Due date' },
  { type: 'amountRange', field: 'total', label: 'Total' },
]

export default function FeeInvoices() {
  const navigate = useNavigate()
  const filters = useUrlFilters(FILTER_CONFIG)
  const [page, setPage] = useState(1)

  const filterSignature = JSON.stringify(filters.params)
  useEffect(() => {
    setPage(1)
  }, [filterSignature])

  const { data, results, total, isFetching } = usePagedList<FeeInvoice>({
    keyFor: (p) => qk.feeInvoices.list({ ...filters.params, page: p }),
    fetchPage: (p) =>
      feeInvoicesApi.list(filtersToQuery(filters.params, { page: p })).then((r) => r.data as Paginated<FeeInvoice>),
    page,
    pageSize: PAGE_SIZE,
  })
  const isRefreshing = isFetching && !!data

  const { data: terms } = useQuery({
    queryKey: qk.terms.list(),
    queryFn: () => termsApi.list().then((r) => r.data as Term[]),
  })
  const termName = (id: number) => (terms ?? []).find((t) => t.id === id)?.name ?? `#${id}`

  // Warm the invoice detail cache on row hover so opening an invoice is instant.
  const prefetchInvoice = usePrefetchDetail<FeeInvoice>(
    (i) => qk.feeInvoices.detail(i.id),
    (i) => feeInvoicesApi.get(i.id).then((r) => r.data)
  )

  const columns: Column<FeeInvoice>[] = [
    { key: 'number', header: 'Number', render: (i) => <span className="font-mono text-primary-600 dark:text-primary-400">{i.number}</span> },
    { key: 'date', header: 'Date' },
    {
      key: 'student_name',
      header: 'Student',
      render: (i) => (
        <Link
          to={`/app/students/${i.student}`}
          onClick={(e) => e.stopPropagation()}
          className="text-primary-600 dark:text-primary-400 hover:underline"
        >
          {i.student_name}
        </Link>
      ),
    },
    { key: 'term', header: 'Term', render: (i) => termName(i.term) },
    { key: 'currency', header: 'Ccy' },
    { key: 'total', header: 'Total', align: 'right', render: (i) => <span className="tabular-nums">{fmtMoney(i.total)}</span> },
    { key: 'amount_paid', header: 'Paid', align: 'right', render: (i) => <span className="tabular-nums">{fmtMoney(i.amount_paid)}</span> },
    { key: 'balance', header: 'Balance', align: 'right', render: (i) => <span className="tabular-nums">{fmtMoney(i.balance)}</span> },
    { key: 'status', header: 'Status', render: (i) => <StatusBadge status={i.status} /> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fee Invoices"
        description="Termly fee invoices — post to raise the debtor, cancel to void"
        icon={FileText}
      />

      <FilterBar config={FILTER_CONFIG} filters={filters} />

      <div className="relative">
        <RefreshingOverlay active={isRefreshing} />
        <div className={refreshingContentClass(isRefreshing)}>
          <DataTable<FeeInvoice>
            rowKey={(i) => i.id}
            columns={columns}
            data={results}
            loading={!data}
            onRowClick={(i) => navigate(`/app/fee-invoices/${i.id}`)}
            onRowHover={prefetchInvoice}
            emptyTitle="No invoices found"
            emptyDescription="No invoices match the current filters."
            pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
          />
        </div>
      </div>
    </div>
  )
}
