import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { FileText, X } from '@phosphor-icons/react'
import { feeInvoicesApi, termsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { useDebounce } from '@/lib/utils'
import { DataTable, PageHeader, StatusBadge, type Column } from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import type { Term } from '@/types/students'
import { fmtMoney, type FeeInvoice } from '@/types/fees'

const INVOICE_STATUSES = ['', 'draft', 'posted', 'partial', 'paid', 'cancelled']

export default function FeeInvoices() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const statusFilter = searchParams.get('status') ?? ''
  const billingRunFilter = searchParams.get('billing_run') ?? ''
  const studentFilter = searchParams.get('student') ?? ''
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search, 300)

  const { data, isLoading } = useQuery({
    queryKey: qk.feeInvoices.list({
      page,
      search: debouncedSearch,
      status: statusFilter,
      billing_run: billingRunFilter,
      student: studentFilter,
    }),
    queryFn: () =>
      feeInvoicesApi
        .list({
          page,
          search: debouncedSearch || undefined,
          status: statusFilter || undefined,
          billing_run: billingRunFilter || undefined,
          student: studentFilter || undefined,
        })
        .then((r) => r.data as Paginated<FeeInvoice>),
    placeholderData: keepPreviousData,
  })

  const { data: terms } = useQuery({
    queryKey: qk.terms.list(),
    queryFn: () => termsApi.list().then((r) => r.data as Term[]),
  })
  const termName = (id: number) => (terms ?? []).find((t) => t.id === id)?.name ?? `#${id}`

  const clearParam = (key: string) => {
    const next = new URLSearchParams(searchParams)
    next.delete(key)
    setSearchParams(next, { replace: true })
    setPage(1)
  }

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

      <div className="flex gap-2 flex-wrap items-center">
        {INVOICE_STATUSES.map((s) => (
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
        {billingRunFilter && (
          <span className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">
            Billing run #{billingRunFilter}
            <button onClick={() => clearParam('billing_run')} className="hover:text-primary-900">
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
        )}
        {studentFilter && (
          <span className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300">
            Student #{studentFilter}
            <button onClick={() => clearParam('student')} className="hover:text-primary-900">
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
        )}
      </div>

      <DataTable<FeeInvoice>
        rowKey={(i) => i.id}
        columns={columns}
        data={data?.results ?? []}
        loading={isLoading}
        searchable
        searchValue={search}
        onSearch={(q) => { setSearch(q); setPage(1) }}
        searchPlaceholder="Search invoice number or student…"
        onRowClick={(i) => navigate(`/app/fee-invoices/${i.id}`)}
        emptyTitle="No invoices found"
        pagination={{ page, pageSize: 25, total: data?.count ?? 0, onPageChange: setPage }}
      />
    </div>
  )
}
