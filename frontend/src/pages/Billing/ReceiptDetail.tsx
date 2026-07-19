import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { Banknote, FileDown, RotateCcw } from 'lucide-react'
import { bankAccountsApi, receiptsApi } from '@/services/api'
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
import type { BankAccount } from '@/types/accounting'
import { fmtMoney, type Receipt } from '@/types/fees'

export default function ReceiptDetail() {
  const { id } = useParams()
  const queryClient = useQueryClient()
  const [confirmReverse, setConfirmReverse] = useState(false)

  const { data: receipt, isLoading } = useQuery({
    queryKey: qk.receipts.detail(id!),
    queryFn: () => receiptsApi.get(id!).then((r) => r.data as Receipt),
  })

  const { data: bankAccounts } = useQuery({
    queryKey: qk.bankAccounts.list(),
    queryFn: () => bankAccountsApi.list().then((r) => r.data as BankAccount[]),
  })

  const reverseMutation = useMutation({
    mutationFn: (reason: string) => receiptsApi.reverse(id!, reason),
    onSuccess: () => {
      showToast.success('Receipt reversed')
      queryClient.invalidateQueries({ queryKey: qk.receipts.all })
      queryClient.invalidateQueries({ queryKey: qk.feeInvoices.all })
      queryClient.invalidateQueries({ queryKey: qk.journals.all })
      queryClient.invalidateQueries({ queryKey: qk.students.all })
      queryClient.invalidateQueries({ queryKey: qk.reports.all })
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to reverse receipt')),
  })

  if (isLoading || !receipt) return <SkeletonCard />

  const bank = (bankAccounts ?? []).find((b) => b.id === receipt.bank_account)

  return (
    <div className="space-y-6">
      <PageHeader
        title={receipt.number}
        description={`${receipt.student_name} · ${receipt.currency} ${fmtMoney(receipt.amount)}`}
        icon={Banknote}
        backLink="/app/receipts"
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status={receipt.status} />
            <Button variant="secondary" onClick={() => window.open(`/api/reports/receipt-pdf/${receipt.id}/`, '_blank')}>
              <FileDown className="w-4 h-4 mr-2" /> PDF
            </Button>
            {receipt.status === 'posted' && (
              <Button variant="secondary" onClick={() => setConfirmReverse(true)}>
                <RotateCcw className="w-4 h-4 mr-2" /> Reverse
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <span className="text-gray-500 block">Student</span>
          <Link to={`/app/students/${receipt.student}`} className="text-primary-600 dark:text-primary-400 hover:underline">
            <span className="font-mono">{receipt.student_code}</span> {receipt.student_name}
          </Link>
        </div>
        <div><span className="text-gray-500 block">Date</span>{receipt.date}</div>
        <div><span className="text-gray-500 block">Bank account</span>{bank ? `${bank.name} (${bank.currency})` : `#${receipt.bank_account}`}</div>
        <div><span className="text-gray-500 block">Method</span><span className="capitalize">{receipt.payment_method.replace(/_/g, ' ')}</span></div>
        <div>
          <span className="text-gray-500 block">Amount</span>
          <CurrencyDisplay amount={Number(receipt.amount)} currency={receipt.currency} size="lg" />
        </div>
        <div><span className="text-gray-500 block">Currency</span>{receipt.currency} @ {parseFloat(receipt.exchange_rate)}</div>
        <div>
          <span className="text-gray-500 block">Unallocated</span>
          <span className="tabular-nums">{fmtMoney(receipt.unallocated_amount)}</span>
        </div>
        <div>
          <span className="text-gray-500 block">Journal</span>
          {receipt.journal ? (
            <Link to={`/app/journals/${receipt.journal}`} className="text-primary-600 dark:text-primary-400 hover:underline font-mono">
              {receipt.journal_number ?? `#${receipt.journal}`}
            </Link>
          ) : '—'}
        </div>
        {receipt.reference && (
          <div><span className="text-gray-500 block">Reference</span>{receipt.reference}</div>
        )}
        {receipt.notes && (
          <div className="col-span-2"><span className="text-gray-500 block">Notes</span>{receipt.notes}</div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Allocations</h3>
        {receipt.allocations.length === 0 ? (
          <p className="text-sm text-gray-500">
            Nothing allocated — the full amount is sitting as an unallocated credit on the student's account.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3 text-right">Amount applied</th>
                </tr>
              </thead>
              <tbody>
                {receipt.allocations.map((alloc) => (
                  <tr key={alloc.id} className="border-t border-gray-100 dark:border-gray-700/50">
                    <td className="px-4 py-2.5">
                      <Link
                        to={`/app/fee-invoices/${alloc.invoice}`}
                        className="font-mono text-primary-600 dark:text-primary-400 hover:underline"
                      >
                        {alloc.invoice_number}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(alloc.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold">
                <tr>
                  <td className="px-4 py-3">Total allocated</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {fmtMoney(receipt.allocations.reduce((sum, a) => sum + Number(a.amount), 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmReverse}
        onClose={() => setConfirmReverse(false)}
        onConfirm={() => { setConfirmReverse(false); reverseMutation.mutate('Manual reversal') }}
        title={`Reverse ${receipt.number}?`}
        message="A mirror-image journal will be posted, allocations will be unwound and the affected invoices reopened. The general ledger is never edited or deleted."
        confirmText="Reverse receipt"
        variant="danger"
      />
    </div>
  )
}
