import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Money, Plus } from '@phosphor-icons/react'
import { receiptsApi, studentsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { usePagedList } from '@/hooks/usePaginatedQuery'
import { usePrefetchDetail } from '@/hooks/usePrefetch'
import { useUrlFilters, filtersToQuery, type FilterConfig } from '@/hooks/useUrlFilters'
import { useCan } from '@/hooks/useCan'
import { Button, DataTable, FilterBar, PageHeader, RefreshingOverlay, StatusBadge, refreshingContentClass, type Column } from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import { PAYMENT_METHODS, fmtMoney, type Receipt } from '@/types/fees'
import ReceiptFormModal from './ReceiptFormModal'

const PAGE_SIZE = 25

const PAYMENT_METHOD_OPTIONS = PAYMENT_METHODS.map(([value, label]) => ({ value, label }))

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD' },
  { value: 'ZWG', label: 'ZWG' },
]

const STATUS_OPTIONS = [
  { value: 'posted', label: 'Posted' },
  { value: 'reversed', label: 'Reversed' },
]

const FILTER_CONFIG: FilterConfig = [
  { type: 'search', placeholder: 'Search receipt number…' },
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
  { type: 'chips', field: 'payment_method', label: 'Method', multi: true, options: PAYMENT_METHOD_OPTIONS },
  { type: 'chips', field: 'currency', label: 'Currency', options: CURRENCY_OPTIONS },
  { type: 'chips', field: 'status', label: 'Status', options: STATUS_OPTIONS },
  { type: 'dateRange', field: 'date', label: 'Date' },
  { type: 'amountRange', field: 'amount', label: 'Amount' },
]

export default function Receipts() {
  const navigate = useNavigate()
  const filters = useUrlFilters(FILTER_CONFIG)
  const [page, setPage] = useState(1)
  // Arriving with ?student= means "record a payment for this student" — open the
  // form immediately with the student preselected (captured once, on mount).
  const initialStudent = useRef(filters.params.student ?? null).current
  const [showForm, setShowForm] = useState(Boolean(initialStudent))
  const canCreate = useCan('fees', 'create')

  const filterSignature = JSON.stringify(filters.params)
  useEffect(() => {
    setPage(1)
  }, [filterSignature])

  const { data, results, total, isFetching } = usePagedList<Receipt>({
    keyFor: (p) => qk.receipts.list({ ...filters.params, page: p }),
    fetchPage: (p) =>
      receiptsApi.list(filtersToQuery(filters.params, { page: p })).then((r) => r.data as Paginated<Receipt>),
    page,
    pageSize: PAGE_SIZE,
  })
  const isRefreshing = isFetching && !!data

  // Warm the receipt detail cache on row hover so opening a receipt is instant.
  const prefetchReceipt = usePrefetchDetail<Receipt>(
    (r) => qk.receipts.detail(r.id),
    (r) => receiptsApi.get(r.id).then((res) => res.data)
  )

  const closeForm = () => {
    setShowForm(false)
    if (initialStudent) filters.removeParam('student')
  }

  const columns: Column<Receipt>[] = [
    { key: 'number', header: 'Number', render: (r) => <span className="font-mono text-primary-600 dark:text-primary-400">{r.number}</span> },
    { key: 'date', header: 'Date' },
    {
      key: 'student_name',
      header: 'Student',
      render: (r) => (
        <Link
          to={`/app/students/${r.student}`}
          onClick={(e) => e.stopPropagation()}
          className="text-primary-600 dark:text-primary-400 hover:underline"
        >
          {r.student_name}
        </Link>
      ),
    },
    { key: 'amount', header: 'Amount', align: 'right', render: (r) => <span className="tabular-nums">{fmtMoney(r.amount)}</span> },
    { key: 'currency', header: 'Ccy' },
    { key: 'payment_method', header: 'Method', render: (r) => <span className="capitalize">{r.payment_method.replace(/_/g, ' ')}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Receipts"
        description="Fee payments — each receipt posts to the ledger and allocates FIFO"
        icon={Money}
        actions={
          canCreate ? (
            <Button onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4 mr-2" /> New Receipt
            </Button>
          ) : undefined
        }
      />

      <FilterBar config={FILTER_CONFIG} filters={filters} />

      <div className="relative">
        <RefreshingOverlay active={isRefreshing} />
        <div className={refreshingContentClass(isRefreshing)}>
          <DataTable<Receipt>
            rowKey={(r) => r.id}
            columns={columns}
            data={results}
            loading={!data}
            onRowClick={(r) => navigate(`/app/receipts/${r.id}`)}
            onRowHover={prefetchReceipt}
            emptyTitle="No receipts found"
            emptyDescription="No receipts match the current filters."
            pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
          />
        </div>
      </div>

      {showForm && (
        <ReceiptFormModal open={showForm} onClose={closeForm} initialStudent={initialStudent} />
      )}
    </div>
  )
}
