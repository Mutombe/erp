import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle, FileText } from '@phosphor-icons/react'
import { supplierPaymentsApi, vendorBillsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { showToast, parseApiError } from '@/lib/toast'
import {
  Button,
  ConfirmDialog,
  PageHeader,
  RefreshingOverlay,
  Skeleton,
  SkeletonCard,
  StatusBadge,
  refreshingContentClass,
} from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import { money, type SupplierPayment, type VendorBill } from '@/types/procurement'

export default function VendorBillDetail() {
  const { id } = useParams()
  const queryClient = useQueryClient()
  const [confirmPost, setConfirmPost] = useState(false)

  const { data: bill, isFetching } = useQuery({
    queryKey: qk.vendorBills.detail(id!),
    queryFn: () => vendorBillsApi.get(id!).then((r) => r.data as VendorBill),
  })
  const isRefreshing = isFetching && !!bill

  // Payments that touched this bill — filter this supplier's payments client-side.
  const { data: payments, isFetching: paymentsFetching } = useQuery({
    queryKey: qk.supplierPayments.list({ supplier: bill?.supplier, bill: id }),
    queryFn: () =>
      supplierPaymentsApi
        .list({ supplier: bill!.supplier, page_size: 100 })
        .then((r) => r.data as Paginated<SupplierPayment>),
    enabled: !!bill,
  })
  const paymentsRefreshing = paymentsFetching && !!payments

  const billId = Number(id)
  const appliedPayments = (payments?.results ?? [])
    .map((p) => ({
      payment: p,
      allocated: p.allocations
        .filter((a) => a.bill === billId)
        .reduce((sum, a) => sum + parseFloat(a.amount), 0),
    }))
    .filter((x) => x.allocated > 0)

  // Posting raises the payable in the GL.
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: qk.vendorBills.all })
    queryClient.invalidateQueries({ queryKey: qk.journals.all })
    queryClient.invalidateQueries({ queryKey: qk.accounts.all })
    queryClient.invalidateQueries({ queryKey: qk.reports.all })
  }

  const postMutation = useMutation({
    mutationFn: () => vendorBillsApi.post(id!),
    onSuccess: () => { showToast.success('Bill posted'); invalidateAll() },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to post bill')),
  })

  if (!bill) return <SkeletonCard />

  return (
    <div className="relative space-y-6">
      <RefreshingOverlay active={isRefreshing} />
      <PageHeader
        title={bill.number}
        description={`Vendor bill from ${bill.supplier_name}${bill.supplier_reference ? ` · ref ${bill.supplier_reference}` : ''}`}
        icon={FileText}
        backLink="/app/vendor-bills"
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status={bill.status} />
            {bill.status === 'draft' && (
              <Button onClick={() => setConfirmPost(true)} loading={postMutation.isPending}>
                <CheckCircle className="w-4 h-4 mr-2" /> Post
              </Button>
            )}
          </div>
        }
      />

      <div className={refreshingContentClass(isRefreshing, 'space-y-6')}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500 block">Supplier</span>
            <Link to={`/app/suppliers/${bill.supplier}`} className="text-primary-600 dark:text-primary-400 hover:underline">
              {bill.supplier_name}
            </Link>
          </div>
          <div><span className="text-gray-500 block">Date / Due</span>{bill.date} → {bill.due_date}</div>
          <div><span className="text-gray-500 block">Currency</span>{bill.currency} @ {parseFloat(bill.exchange_rate)}</div>
          <div>
            <span className="text-gray-500 block">Journal</span>
            {bill.journal ? (
              <Link to={`/app/journals/${bill.journal}`} className="text-primary-600 dark:text-primary-400 hover:underline font-mono">
                {bill.journal_number}
              </Link>
            ) : '—'}
          </div>
          {bill.po && (
            <div>
              <span className="text-gray-500 block">Purchase order</span>
              <Link to={`/app/purchase-orders/${bill.po}`} className="text-primary-600 dark:text-primary-400 hover:underline font-mono">
                {bill.po_number}
              </Link>
            </div>
          )}
          <div><span className="text-gray-500 block">Paid</span><span className="tabular-nums">{money(bill.amount_paid)}</span></div>
          <div><span className="text-gray-500 block">Balance</span><span className="tabular-nums font-semibold">{money(bill.balance)}</span></div>
        </div>
  
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Unit price</th>
                <th className="px-4 py-3 text-right">Line total</th>
              </tr>
            </thead>
            <tbody>
              {bill.lines.map((line) => (
                <tr key={line.id} className="border-t border-gray-100 dark:border-gray-700/50">
                  <td className="px-4 py-2.5">
                    {line.description || (line.grn_line ? `GRN line #${line.grn_line}` : '—')}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(line.quantity)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(line.unit_price)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {money(parseFloat(line.quantity) * parseFloat(line.unit_price))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold">
              <tr>
                <td className="px-4 py-3" colSpan={3}>Total ({bill.currency})</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(bill.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Payments applied</h3>
        <div className="relative">
          <RefreshingOverlay active={paymentsRefreshing} />
          <div
            className={refreshingContentClass(
              paymentsRefreshing,
              'rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/50'
            )}
          >
            {!payments && (
              <div className="px-4 py-3 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            )}
            {payments && appliedPayments.length === 0 && (
              <p className="px-4 py-5 text-sm text-gray-500 text-center">No payments applied yet</p>
            )}
            {appliedPayments.map(({ payment, allocated }) => (
              <Link
                key={payment.id}
                to={`/app/supplier-payments/${payment.id}`}
                className="flex items-center justify-between px-4 py-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <span className="font-mono text-primary-600 dark:text-primary-400">{payment.number}</span>
                <span className="text-gray-500">{payment.date}</span>
                <span className="tabular-nums">{money(allocated)} {payment.currency}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmPost}
        onClose={() => setConfirmPost(false)}
        onConfirm={() => { setConfirmPost(false); postMutation.mutate() }}
        title={`Post ${bill.number}?`}
        message="The payable is raised in the general ledger. Posted bills cannot be edited."
        confirmText="Post Bill"
      />
    </div>
  )
}
