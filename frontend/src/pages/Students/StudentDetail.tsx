import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Money, FileArrowDown, FileText, GraduationCap, Receipt as ReceiptIcon, Scroll, User } from '@phosphor-icons/react'
import { feeInvoicesApi, guardiansApi, receiptsApi, reportsApi, studentsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { formatDate } from '@/lib/utils'
import {
  Button,
  DataTable,
  SkeletonCard,
  PageHeader,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type Column,
} from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import type { Guardian, Student, StudentStatement } from '@/types/students'
import { fmtMoney, type FeeInvoice, type Receipt } from '@/types/fees'

const TABS = ['overview', 'invoices', 'receipts', 'statement'] as const

export default function StudentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab') ?? ''
  const initialTab = (TABS as readonly string[]).includes(tabParam) ? tabParam : 'overview'
  const [statementCurrency, setStatementCurrency] = useState('USD')

  const { data: student, isLoading } = useQuery({
    queryKey: qk.students.detail(id!),
    queryFn: () => studentsApi.get(id!).then((r) => r.data as Student),
  })

  if (isLoading || !student) return <SkeletonCard />

  const setTab = (tab: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', tab)
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={student.full_name}
        description={`${student.code}${student.current_class ? ` · ${student.current_class}` : ''}`}
        icon={GraduationCap}
        backLink="/app/students"
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status={student.status} />
            <Button onClick={() => navigate(`/app/receipts?student=${student.id}`)}>
              <Money className="w-4 h-4 mr-2" /> Record Payment
            </Button>
          </div>
        }
      />

      <Tabs defaultValue={initialTab} onChange={setTab}>
        <TabsList className="dark:bg-gray-800">
          <TabsTrigger value="overview" icon={User}>Overview</TabsTrigger>
          <TabsTrigger value="invoices" icon={FileText}>Invoices</TabsTrigger>
          <TabsTrigger value="receipts" icon={ReceiptIcon}>Receipts</TabsTrigger>
          <TabsTrigger value="statement" icon={Scroll}>Statement</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewTab student={student} />
        </TabsContent>
        <TabsContent value="invoices" className="mt-6">
          <InvoicesTab studentId={student.id} />
        </TabsContent>
        <TabsContent value="receipts" className="mt-6">
          <ReceiptsTab studentId={student.id} />
        </TabsContent>
        <TabsContent value="statement" className="mt-6">
          <StatementTab
            studentId={student.id}
            currency={statementCurrency}
            onCurrencyChange={setStatementCurrency}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function OverviewTab({ student }: { student: Student }) {
  // No dedicated "guardians of student" endpoint — the guardian serializer
  // embeds its students, so fetch the (small) guardian list and filter.
  const { data: guardians } = useQuery({
    queryKey: qk.guardians.list({ forStudent: student.id }),
    queryFn: () =>
      guardiansApi.list({ page_size: 500 }).then((r) => (r.data as Paginated<Guardian>).results),
  })
  const linkedGuardians = (guardians ?? []).filter((g) =>
    (g.students ?? []).some((s) => s.id === student.id)
  )

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div><span className="text-gray-500 block">Admission code</span><span className="font-mono">{student.code}</span></div>
        <div><span className="text-gray-500 block">Gender</span><span className="capitalize">{student.gender || '—'}</span></div>
        <div><span className="text-gray-500 block">Date of birth</span>{student.dob ? formatDate(student.dob) : '—'}</div>
        <div><span className="text-gray-500 block">Admission date</span>{student.admission_date ? formatDate(student.admission_date) : '—'}</div>
        <div><span className="text-gray-500 block">Current class</span>{student.current_class || '—'}</div>
        <div><span className="text-gray-500 block">Attendance</span>{student.attendance_type === 'boarder' ? 'Boarder' : 'Day scholar'}</div>
        <div><span className="text-gray-500 block">National ID / birth cert</span>{student.national_id_or_birth_cert || '—'}</div>
        <div>
          <span className="text-gray-500 block">Balances</span>
          {(student.balances ?? []).length === 0 ? '—' : (
            <span className="tabular-nums">
              {(student.balances ?? []).map((b) => `${b.currency} ${fmtMoney(b.balance)}`).join(' · ')}
            </span>
          )}
        </div>
        {student.medical_notes && (
          <div className="col-span-2 md:col-span-4">
            <span className="text-gray-500 block">Medical notes</span>{student.medical_notes}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Guardians</h3>
        {linkedGuardians.length === 0 ? (
          <p className="text-sm text-gray-500">No guardians linked to this student.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Email</th>
                </tr>
              </thead>
              <tbody>
                {linkedGuardians.map((g) => (
                  <tr key={g.id} className="border-t border-gray-100 dark:border-gray-700/50">
                    <td className="px-4 py-2.5">
                      <Link to={`/app/guardians/${g.id}`} className="font-mono text-primary-600 dark:text-primary-400 hover:underline">
                        {g.code}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">{g.full_name}</td>
                    <td className="px-4 py-2.5">{g.phone || '—'}</td>
                    <td className="px-4 py-2.5">{g.email || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function InvoicesTab({ studentId }: { studentId: number }) {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const { data, isLoading } = useQuery({
    queryKey: qk.feeInvoices.list({ student: studentId, page }),
    queryFn: () =>
      feeInvoicesApi.list({ student: studentId, page }).then((r) => r.data as Paginated<FeeInvoice>),
  })

  const columns: Column<FeeInvoice>[] = [
    { key: 'number', header: 'Number', render: (i) => <span className="font-mono text-primary-600 dark:text-primary-400">{i.number}</span> },
    { key: 'date', header: 'Date' },
    { key: 'total', header: 'Total', align: 'right', render: (i) => <span className="tabular-nums">{fmtMoney(i.total)}</span> },
    { key: 'amount_paid', header: 'Paid', align: 'right', render: (i) => <span className="tabular-nums">{fmtMoney(i.amount_paid)}</span> },
    { key: 'balance', header: 'Balance', align: 'right', render: (i) => <span className="tabular-nums">{fmtMoney(i.balance)}</span> },
    { key: 'currency', header: 'Ccy' },
    { key: 'status', header: 'Status', render: (i) => <StatusBadge status={i.status} /> },
  ]

  return (
    <DataTable<FeeInvoice>
      rowKey={(i) => i.id}
      columns={columns}
      data={data?.results ?? []}
      loading={isLoading}
      onRowClick={(i) => navigate(`/app/fee-invoices/${i.id}`)}
      emptyTitle="No invoices for this student"
      pagination={{ page, pageSize: 25, total: data?.count ?? 0, onPageChange: setPage }}
    />
  )
}

function ReceiptsTab({ studentId }: { studentId: number }) {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const { data, isLoading } = useQuery({
    queryKey: qk.receipts.list({ student: studentId, page }),
    queryFn: () =>
      receiptsApi.list({ student: studentId, page }).then((r) => r.data as Paginated<Receipt>),
  })

  const columns: Column<Receipt>[] = [
    { key: 'number', header: 'Number', render: (r) => <span className="font-mono text-primary-600 dark:text-primary-400">{r.number}</span> },
    { key: 'date', header: 'Date' },
    { key: 'amount', header: 'Amount', align: 'right', render: (r) => <span className="tabular-nums">{fmtMoney(r.amount)}</span> },
    { key: 'currency', header: 'Ccy' },
    { key: 'payment_method', header: 'Method', render: (r) => <span className="capitalize">{r.payment_method.replace(/_/g, ' ')}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ]

  return (
    <DataTable<Receipt>
      rowKey={(r) => r.id}
      columns={columns}
      data={data?.results ?? []}
      loading={isLoading}
      onRowClick={(r) => navigate(`/app/receipts/${r.id}`)}
      emptyTitle="No receipts for this student"
      pagination={{ page, pageSize: 25, total: data?.count ?? 0, onPageChange: setPage }}
    />
  )
}

function StatementTab({
  studentId,
  currency,
  onCurrencyChange,
}: {
  studentId: number
  currency: string
  onCurrencyChange: (c: string) => void
}) {
  const { data: statement, isLoading } = useQuery({
    queryKey: qk.reports.studentStatement(studentId, { currency }),
    queryFn: () =>
      reportsApi.studentStatement(studentId, { currency }).then((r) => r.data as StudentStatement),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {['USD', 'ZWG'].map((c) => (
          <button
            key={c}
            onClick={() => onCurrencyChange(c)}
            className={`px-3 py-1.5 text-sm rounded-full border ${
              currency === c
                ? 'bg-primary-600 text-white border-primary-600'
                : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            {c}
          </button>
        ))}
        {statement && (
          <span className="text-sm text-gray-500 ml-2">
            {formatDate(statement.start)} — {formatDate(statement.end)}
          </span>
        )}
        <div className="ml-auto">
          <Button
            variant="secondary"
            onClick={() =>
              window.open(`/api/reports/student-statement/${studentId}/pdf/?currency=${currency}`, '_blank')
            }
          >
            <FileArrowDown className="w-4 h-4 mr-2" /> PDF
          </Button>
        </div>
      </div>

      {isLoading || !statement ? (
        <SkeletonCard />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right">Debit</th>
                <th className="px-4 py-3 text-right">Credit</th>
                <th className="px-4 py-3 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-gray-100 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/40 font-medium">
                <td className="px-4 py-2.5">{formatDate(statement.start)}</td>
                <td className="px-4 py-2.5" colSpan={5}>Opening balance</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(statement.opening_balance)}</td>
              </tr>
              {statement.rows.map((row, idx) => (
                <tr key={idx} className="border-t border-gray-100 dark:border-gray-700/50">
                  <td className="px-4 py-2.5 whitespace-nowrap">{row.date}</td>
                  <td className="px-4 py-2.5 capitalize">{row.category}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {row.journal_id ? (
                      <Link to={`/app/journals/${row.journal_id}`} className="text-primary-600 dark:text-primary-400 hover:underline">
                        {row.reference || row.source_ref || `#${row.journal_id}`}
                      </Link>
                    ) : (
                      row.reference || '—'
                    )}
                  </td>
                  <td className="px-4 py-2.5 max-w-sm truncate">{row.description}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {Number(row.debit) !== 0 ? fmtMoney(row.debit) : ''}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {Number(row.credit) !== 0 ? fmtMoney(row.credit) : ''}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(row.balance)}</td>
                </tr>
              ))}
              {statement.rows.length === 0 && (
                <tr className="border-t border-gray-100 dark:border-gray-700/50">
                  <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                    No transactions in {statement.currency} for this period.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold">
              <tr>
                <td className="px-4 py-3" colSpan={6}>Closing balance ({statement.currency})</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(statement.closing_balance)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
