import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CheckCircle, FilePlus, BoxArrowDown } from '@phosphor-icons/react'
import { grnsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { showToast, parseApiError } from '@/lib/toast'
import {
  Button,
  ConfirmDialog,
  PageHeader,
  RefreshingOverlay,
  SkeletonCard,
  StatusBadge,
  refreshingContentClass,
} from '@/components/ui'
import { money, type GRN } from '@/types/procurement'

export default function GRNDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmPost, setConfirmPost] = useState(false)

  const { data: grn, isFetching } = useQuery({
    queryKey: qk.grns.detail(id!),
    queryFn: () => grnsApi.get(id!).then((r) => r.data as GRN),
  })
  const isRefreshing = isFetching && !!grn

  // Posting a GRN receives stock and writes the GL — invalidate broadly.
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: qk.grns.all })
    queryClient.invalidateQueries({ queryKey: qk.purchaseOrders.all })
    queryClient.invalidateQueries({ queryKey: qk.items.all })
    queryClient.invalidateQueries({ queryKey: qk.stockMoves.all })
    queryClient.invalidateQueries({ queryKey: qk.stockLevels.all })
    queryClient.invalidateQueries({ queryKey: qk.journals.all })
    queryClient.invalidateQueries({ queryKey: qk.accounts.all })
    queryClient.invalidateQueries({ queryKey: qk.reports.all })
  }

  const postMutation = useMutation({
    mutationFn: () => grnsApi.post(id!),
    onSuccess: () => { showToast.success('GRN posted'); invalidateAll() },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to post GRN')),
  })

  if (!grn) return <SkeletonCard />

  const totalBase = grn.lines.reduce(
    (sum, l) => sum + parseFloat(l.quantity) * parseFloat(l.unit_cost_base),
    0
  )

  return (
    <div className="relative space-y-6">
      <RefreshingOverlay active={isRefreshing} />
      <PageHeader
        title={grn.number}
        description={`Goods received against ${grn.po_number}`}
        icon={BoxArrowDown}
        backLink="/app/grns"
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status={grn.status} />
            {grn.status === 'draft' && (
              <Button onClick={() => setConfirmPost(true)} loading={postMutation.isPending}>
                <CheckCircle className="w-4 h-4 mr-2" /> Post
              </Button>
            )}
            {grn.status === 'posted' && (
              <Button onClick={() => navigate(`/app/vendor-bills?grn=${grn.id}`)}>
                <FilePlus className="w-4 h-4 mr-2" /> Create Vendor Bill
              </Button>
            )}
          </div>
        }
      />

      <div className={refreshingContentClass(isRefreshing, 'space-y-6')}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500 block">Purchase order</span>
            <Link to={`/app/purchase-orders/${grn.po}`} className="text-primary-600 dark:text-primary-400 hover:underline font-mono">
              {grn.po_number}
            </Link>
          </div>
          <div><span className="text-gray-500 block">Warehouse</span><span className="font-mono">{grn.warehouse_code}</span></div>
          <div><span className="text-gray-500 block">Date</span>{grn.date}</div>
          <div>
            <span className="text-gray-500 block">Journal</span>
            {grn.journal ? (
              <Link to={`/app/journals/${grn.journal}`} className="text-primary-600 dark:text-primary-400 hover:underline font-mono">
                {grn.journal_number}
              </Link>
            ) : '—'}
          </div>
        </div>
  
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3 text-right">Quantity</th>
                <th className="px-4 py-3 text-right">Unit cost (base)</th>
                <th className="px-4 py-3 text-right">Line total (base)</th>
              </tr>
            </thead>
            <tbody>
              {grn.lines.map((line) => (
                <tr key={line.id} className="border-t border-gray-100 dark:border-gray-700/50">
                  <td className="px-4 py-2.5 font-mono">{line.item_code || '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(line.quantity)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(line.unit_cost_base)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {money(parseFloat(line.quantity) * parseFloat(line.unit_cost_base))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold">
              <tr>
                <td className="px-4 py-3" colSpan={3}>Total (base)</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(totalBase)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={confirmPost}
        onClose={() => setConfirmPost(false)}
        onConfirm={() => { setConfirmPost(false); postMutation.mutate() }}
        title={`Post ${grn.number}?`}
        message="Stock is received into the warehouse and an inventory journal is posted. This cannot be edited afterwards."
        confirmText="Post GRN"
      />
    </div>
  )
}
