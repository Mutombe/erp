import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { CalendarCheck, CaretLeft, Lock } from '@phosphor-icons/react'
import RecordLink from '@/components/RecordLink'
import { EmptyState, SkeletonCard, StatusBadge } from '@/components/ui'
import { portalApi } from '@/services/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Balance, InvoiceRow, ReceiptRow, StatementResponse } from '@/types/portal'

function isForbidden(error: unknown): boolean {
  return (error as { response?: { status?: number } })?.response?.status === 403
}

function money(value: number | string, currency: string) {
  return formatCurrency(Number(value ?? 0), currency)
}

function NetBalances({ balances }: { balances: Balance[] }) {
  const owed = balances.filter((b) => Number(b.amount) !== 0)
  if (owed.length === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-lg font-semibold text-emerald-600 dark:text-emerald-400">
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        Paid up
      </span>
    )
  }
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1">
      {owed.map((b) => (
        <span key={b.currency} className="text-2xl font-bold text-gray-900 dark:text-slate-100 tabular-nums">
          {formatCurrency(Number(b.amount), b.currency)}
        </span>
      ))}
    </div>
  )
}

export default function StudentStatementPortal() {
  const { id } = useParams()
  const { data, isLoading, error } = useQuery({
    queryKey: ['portal', 'statement', id],
    queryFn: () => portalApi.statement(id!).then((r) => r.data as StatementResponse),
    retry: (count, err) => !isForbidden(err) && count < 2,
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  if (error && isForbidden(error)) {
    return (
      <EmptyState
        icon={Lock}
        title="You don't have access to this student"
        description="This student isn't linked to your account. If you believe this is a mistake, contact your school office."
      />
    )
  }

  if (error || !data) {
    return (
      <EmptyState
        title="Couldn't load this statement"
        description="Please go back and try again."
      />
    )
  }

  const { student, invoices, receipts, balances } = data
  const meta = [student.class_name, student.grade].filter(Boolean).join(' · ')

  return (
    <div className="space-y-6">
      <RecordLink
        to="/portal"
        className="inline-flex items-center gap-1 text-sm font-medium no-underline hover:underline"
      >
        <CaretLeft className="w-4 h-4" /> Back to home
      </RecordLink>

      {/* Header card with prominent net balance */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100 truncate">{student.name}</h1>
            <p className="text-xs uppercase tracking-wider text-gray-400 dark:text-slate-500 font-mono mt-0.5">
              {student.code}
            </p>
            {meta && <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">{meta}</p>}
          </div>
          <RecordLink
            to={`/portal/students/${student.id}/attendance`}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600 no-underline hover:no-underline shrink-0"
          >
            <CalendarCheck className="w-4 h-4" /> Attendance
          </RecordLink>
        </div>
        <div className="mt-5 pt-5 border-t border-gray-100 dark:border-slate-700">
          <p className="text-xs uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-1.5">
            Current balance
          </p>
          <NetBalances balances={balances} />
        </div>
      </div>

      {/* Invoices */}
      <section>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-3">Invoices</h2>
        {invoices.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-slate-400">No invoices yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-slate-800 text-left text-xs uppercase text-gray-500 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Number</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv: InvoiceRow) => (
                  <tr key={inv.id} className="border-t border-gray-100 dark:border-slate-700/50">
                    <td className="px-4 py-2.5 font-mono text-primary-600 dark:text-primary-400">{inv.number}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(inv.date)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{inv.due_date ? formatDate(inv.due_date) : '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{money(inv.total, inv.currency)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{money(inv.amount_paid, inv.currency)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">{money(inv.balance, inv.currency)}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={inv.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Receipts */}
      <section>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-3">Receipts</h2>
        {receipts.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-slate-400">No receipts yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-slate-800 text-left text-xs uppercase text-gray-500 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Number</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((rec: ReceiptRow) => (
                  <tr key={rec.id} className="border-t border-gray-100 dark:border-slate-700/50">
                    <td className="px-4 py-2.5 font-mono text-primary-600 dark:text-primary-400">{rec.number}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(rec.date)}</td>
                    <td className="px-4 py-2.5 capitalize">{rec.payment_method.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2.5">{rec.reference || '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{money(rec.amount, rec.currency)}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={rec.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
