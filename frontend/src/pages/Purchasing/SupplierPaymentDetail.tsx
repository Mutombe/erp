import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { Wallet } from 'lucide-react'
import { supplierPaymentsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { PageHeader, SkeletonCard, StatusBadge } from '@/components/ui'
import { money, type SupplierPayment } from '@/types/procurement'

export default function SupplierPaymentDetail() {
  const { id } = useParams()

  const { data: payment, isLoading } = useQuery({
    queryKey: qk.supplierPayments.detail(id!),
    queryFn: () => supplierPaymentsApi.get(id!).then((r) => r.data as SupplierPayment),
  })

  if (isLoading || !payment) return <SkeletonCard />

  const allocated = payment.allocations.reduce((sum, a) => sum + parseFloat(a.amount), 0)
  const unallocated = parseFloat(payment.amount) - allocated

  return (
    <div className="space-y-6">
      <PageHeader
        title={payment.number}
        description={`Payment to ${payment.supplier_name}`}
        icon={Wallet}
        backLink="/app/supplier-payments"
        actions={<StatusBadge status={payment.status} />}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <span className="text-gray-500 block">Supplier</span>
          <Link to={`/app/suppliers/${payment.supplier}`} className="text-primary-600 dark:text-primary-400 hover:underline">
            {payment.supplier_name}
          </Link>
        </div>
        <div><span className="text-gray-500 block">Date</span>{payment.date}</div>
        <div>
          <span className="text-gray-500 block">Amount</span>
          <span className="tabular-nums font-semibold">{money(payment.amount)} {payment.currency}</span>
        </div>
        <div>
          <span className="text-gray-500 block">Journal</span>
          {payment.journal ? (
            <Link to={`/app/journals/${payment.journal}`} className="text-primary-600 dark:text-primary-400 hover:underline font-mono">
              {payment.journal_number}
            </Link>
          ) : '—'}
        </div>
        <div><span className="text-gray-500 block">Reference</span>{payment.reference || '—'}</div>
        <div><span className="text-gray-500 block">Exchange rate</span>{parseFloat(payment.exchange_rate)}</div>
        {payment.notes && (
          <div className="col-span-2"><span className="text-gray-500 block">Notes</span>{payment.notes}</div>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Allocations</h3>
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Bill</th>
                <th className="px-4 py-3 text-right">Amount applied</th>
                <th className="px-4 py-3 text-right">FX difference (base)</th>
              </tr>
            </thead>
            <tbody>
              {payment.allocations.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-gray-500">
                    Nothing allocated — payment sits on the supplier's account
                  </td>
                </tr>
              )}
              {payment.allocations.map((a) => (
                <tr key={a.id} className="border-t border-gray-100 dark:border-gray-700/50">
                  <td className="px-4 py-2.5">
                    <Link to={`/app/vendor-bills/${a.bill}`} className="text-primary-600 dark:text-primary-400 hover:underline font-mono">
                      {a.bill_number}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(a.amount)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(a.fx_difference_base)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold">
              <tr>
                <td className="px-4 py-3">Total allocated</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(allocated)}</td>
                <td className="px-4 py-3 text-right text-xs text-gray-500">
                  {unallocated > 0.005 ? `${money(unallocated)} unallocated` : ''}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
