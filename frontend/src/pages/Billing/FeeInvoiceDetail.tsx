import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { Ban, CheckCircle2, FileDown, FileText } from 'lucide-react'
import { feeInvoicesApi, receiptsApi, termsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { showToast, parseApiError } from '@/lib/toast'
import {
  Button,
  ConfirmDialog,
  CurrencyDisplay,
  PageHeader,
  SkeletonCard,
  StatusBadge,
} from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import type { Term } from '@/types/students'
import { fmtMoney, type FeeInvoice, type Receipt } from '@/types/fees'

export default function FeeInvoiceDetail() {
  const { id } = useParams()
  const queryClient = useQueryClient()
  const [confirmCancel, setConfirmCancel] = useState(false)

  const { data: invoice, isLoading } = useQuery({
    queryKey: qk.feeInvoices.detail(id!),
    queryFn: () => feeInvoicesApi.get(id!).then((r) => r.data as FeeInvoice),
  })

  const { data: terms } = useQuery({
    queryKey: qk.terms.list(),
    queryFn: () => termsApi.list().then((r) => r.data as Term[]),
  })

  // Payments applied: the invoice serializer has no allocations, so pull the
  // student's receipts and keep those allocated against this invoice.
  const { data: receipts } = useQuery({
    queryKey: qk.receipts.list({ student: invoice?.student, forInvoice: id }),
    queryFn: () =>
      receiptsApi
        .list({ student: invoice!.student, page_size: 200 })
        .then((r) => (r.data as Paginated<Receipt>).results),
    enabled: Boolean(invoice),
  })

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: qk.feeInvoices.all })
    queryClient.invalidateQueries({ queryKey: qk.journals.all })
    queryClient.invalidateQueries({ queryKey: qk.generalLedger.all })
    queryClient.invalidateQueries({ queryKey: qk.students.all })
    queryClient.invalidateQueries({ queryKey: qk.reports.all })
  }

  const postMutation = useMutation({
    mutationFn: () => feeInvoicesApi.post(id!),
    onSuccess: () => { showToast.success('Invoice posted'); invalidateAll() },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to post invoice')),
  })

  const cancelMutation = useMutation({
    mutationFn: () => feeInvoicesApi.cancel(id!, 'Manual cancellation'),
    onSuccess: () => { showToast.success('Invoice cancelled'); invalidateAll() },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to cancel invoice')),
  })

  if (isLoading || !invoice) return <SkeletonCard />

  const termName = (terms ?? []).find((t) => t.id === invoice.term)?.name ?? `#${invoice.term}`
  const canCancel =
    invoice.status === 'draft' || (invoice.status === 'posted' && Number(invoice.amount_paid) === 0)

  const appliedReceipts = (receipts ?? [])
    .map((r) => ({
      receipt: r,
      allocated: r.allocations
        .filter((a) => a.invoice === invoice.id)
        .reduce((sum, a) => sum + Number(a.amount), 0),
    }))
    .filter((x) => x.allocated > 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title={invoice.number}
        description={`${invoice.student_name} · ${termName}`}
        icon={FileText}
        backLink="/app/fee-invoices"
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status={invoice.status} />
            <Button variant="secondary" onClick={() => window.open(`/api/reports/invoice-pdf/${invoice.id}/`, '_blank')}>
              <FileDown className="w-4 h-4 mr-2" /> PDF
            </Button>
            {invoice.status === 'draft' && (
              <Button onClick={() => postMutation.mutate()} loading={postMutation.isPending}>
                <CheckCircle2 className="w-4 h-4 mr-2" /> Post
              </Button>
            )}
            {canCancel && (
              <Button variant="secondary" onClick={() => setConfirmCancel(true)}>
                <Ban className="w-4 h-4 mr-2" /> Cancel Invoice
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <span className="text-gray-500 block">Student</span>
          <Link to={`/app/students/${invoice.student}`} className="text-primary-600 dark:text-primary-400 hover:underline">
            <span className="font-mono">{invoice.student_code}</span> {invoice.student_name}
          </Link>
        </div>
        <div><span className="text-gray-500 block">Term</span>{termName}</div>
        <div><span className="text-gray-500 block">Date</span>{invoice.date}</div>
        <div><span className="text-gray-500 block">Due date</span>{invoice.due_date || '—'}</div>
        <div><span className="text-gray-500 block">Currency</span>{invoice.currency} @ {parseFloat(invoice.exchange_rate)}</div>
        <div>
          <span className="text-gray-500 block">Journal</span>
          {invoice.journal ? (
            <Link to={`/app/journals/${invoice.journal}`} className="text-primary-600 dark:text-primary-400 hover:underline font-mono">
              {invoice.journal_number ?? `#${invoice.journal}`}
            </Link>
          ) : '—'}
        </div>
        {invoice.billing_run && (
          <div>
            <span className="text-gray-500 block">Billing run</span>
            <Link to={`/app/billing-runs/${invoice.billing_run}`} className="text-primary-600 dark:text-primary-400 hover:underline">
              View run
            </Link>
          </div>
        )}
        {invoice.notes && (
          <div className="col-span-2"><span className="text-gray-500 block">Notes</span>{invoice.notes}</div>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
            <tr>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3 text-right">Discount</th>
              <th className="px-4 py-3 text-right">Allocated</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={line.id} className="border-t border-gray-100 dark:border-gray-700/50">
                <td className="px-4 py-2.5 font-mono">{line.fee_category_code}</td>
                <td className="px-4 py-2.5 max-w-sm truncate">{line.description}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(line.amount)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {Number(line.discount_amount) !== 0 ? fmtMoney(line.discount_amount) : ''}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(line.allocated_amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <td className="px-4 py-2.5 text-right text-gray-500" colSpan={2}>Subtotal</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(invoice.subtotal)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(invoice.discount_total)}</td>
              <td />
            </tr>
            <tr className="font-semibold">
              <td className="px-4 py-3 text-right" colSpan={2}>Total / Paid / Balance</td>
              <td className="px-4 py-3 text-right tabular-nums" colSpan={3}>
                <CurrencyDisplay amount={Number(invoice.total)} currency={invoice.currency} />
                <span className="mx-2 text-gray-400">/</span>
                <CurrencyDisplay amount={Number(invoice.amount_paid)} currency={invoice.currency} />
                <span className="mx-2 text-gray-400">/</span>
                <CurrencyDisplay amount={Number(invoice.balance)} currency={invoice.currency} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Payments applied</h3>
        {appliedReceipts.length === 0 ? (
          <p className="text-sm text-gray-500">No receipts have been allocated to this invoice.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3">Receipt</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Applied</th>
                </tr>
              </thead>
              <tbody>
                {appliedReceipts.map(({ receipt, allocated }) => (
                  <tr key={receipt.id} className="border-t border-gray-100 dark:border-gray-700/50">
                    <td className="px-4 py-2.5">
                      <Link to={`/app/receipts/${receipt.id}`} className="font-mono text-primary-600 dark:text-primary-400 hover:underline">
                        {receipt.number}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">{receipt.date}</td>
                    <td className="px-4 py-2.5 capitalize">{receipt.payment_method.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={receipt.status} /></td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(allocated)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => { setConfirmCancel(false); cancelMutation.mutate() }}
        title={`Cancel ${invoice.number}?`}
        message={
          invoice.status === 'posted'
            ? 'The posted journal will be reversed and the invoice voided. The general ledger is never edited or deleted.'
            : 'The draft invoice will be voided.'
        }
        confirmText="Cancel invoice"
        variant="danger"
      />
    </div>
  )
}
