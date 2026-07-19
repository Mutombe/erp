import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Money, Plus } from '@phosphor-icons/react'
import { receiptsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { useDebounce } from '@/lib/utils'
import { Button, DataTable, PageHeader, StatusBadge, type Column } from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import { fmtMoney, type Receipt } from '@/types/fees'
import ReceiptFormModal from './ReceiptFormModal'

export default function Receipts() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const studentParam = searchParams.get('student')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  // Arriving with ?student= means "record a payment for this student" — open
  // the form immediately with the student preselected.
  const [showForm, setShowForm] = useState(Boolean(studentParam))
  const debouncedSearch = useDebounce(search, 300)

  const { data, isLoading } = useQuery({
    queryKey: qk.receipts.list({ page, search: debouncedSearch }),
    queryFn: () =>
      receiptsApi
        .list({ page, search: debouncedSearch || undefined })
        .then((r) => r.data as Paginated<Receipt>),
    placeholderData: keepPreviousData,
  })

  const closeForm = () => {
    setShowForm(false)
    if (studentParam) {
      const next = new URLSearchParams(searchParams)
      next.delete('student')
      setSearchParams(next, { replace: true })
    }
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
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-2" /> New Receipt
          </Button>
        }
      />

      <DataTable<Receipt>
        rowKey={(r) => r.id}
        columns={columns}
        data={data?.results ?? []}
        loading={isLoading}
        searchable
        searchValue={search}
        onSearch={(q) => { setSearch(q); setPage(1) }}
        searchPlaceholder="Search number, reference or student…"
        onRowClick={(r) => navigate(`/app/receipts/${r.id}`)}
        emptyTitle="No receipts found"
        pagination={{ page, pageSize: 25, total: data?.count ?? 0, onPageChange: setPage }}
      />

      {showForm && (
        <ReceiptFormModal open={showForm} onClose={closeForm} initialStudent={studentParam} />
      )}
    </div>
  )
}
