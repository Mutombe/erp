import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CheckCircle, BoxArrowDown, ShoppingCart } from '@phosphor-icons/react'
import { grnsApi, purchaseOrdersApi, vendorBillsApi, warehousesApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { showToast, parseApiError } from '@/lib/toast'
import {
  Button,
  ConfirmDialog,
  Input,
  Modal,
  ModalFooter,
  PageHeader,
  RefreshingOverlay,
  Select,
  Skeleton,
  SkeletonCard,
  StatusBadge,
  refreshingContentClass,
} from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import type { Warehouse } from '@/types/inventory'
import { money, type GRN, type POLine, type PurchaseOrder, type VendorBill } from '@/types/procurement'
import { PoStatusBadge } from './PurchaseOrders'

const today = () => new Date().toISOString().slice(0, 10)

// ---------------------------------------------------------------------------
// Receive goods (GRN) modal — create GRN then post it, both pessimistic.
// ---------------------------------------------------------------------------

interface ReceiveLine {
  po_line: number
  label: string
  outstanding: number
  quantity: string
}

function ReceiveGoodsModal({
  open,
  onClose,
  po,
  onDone,
}: {
  open: boolean
  onClose: () => void
  po: PurchaseOrder
  onDone: () => void
}) {
  const [warehouse, setWarehouse] = useState(0)
  const [date, setDate] = useState(today())
  const [lines, setLines] = useState<ReceiveLine[]>([])

  const { data: warehouses } = useQuery({
    queryKey: qk.warehouses.list({ is_active: true }),
    queryFn: () => warehousesApi.list({ is_active: true }).then((r) => r.data as Warehouse[]),
  })

  // Default every line's receive quantity to the outstanding balance.
  useEffect(() => {
    if (!open) return
    setWarehouse(0)
    setDate(today())
    setLines(
      po.lines
        .map((l: POLine) => {
          const outstanding = Math.max(parseFloat(l.quantity) - parseFloat(l.qty_received), 0)
          return {
            po_line: l.id,
            label: l.item_code ? `${l.item_code} ${l.description || ''}`.trim() : l.description || `Line ${l.id}`,
            outstanding,
            quantity: outstanding.toFixed(2),
          }
        })
        .filter((l) => l.outstanding > 0)
    )
  }, [open, po])

  const mutation = useMutation({
    mutationFn: async () => {
      const payloadLines = lines
        .filter((l) => (Number(l.quantity) || 0) > 0)
        .map((l) => ({ po_line: l.po_line, quantity: Number(l.quantity).toFixed(2) }))
      const created = await grnsApi.create({ po: po.id, warehouse, date, lines: payloadLines })
      // Post immediately — this stamps base costs and writes the GL.
      await grnsApi.post(created.data.id)
      return created.data as GRN
    },
    onSuccess: (grn) => {
      showToast.success(`${grn.number} received and posted`)
      onDone()
      onClose()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to receive goods')),
  })

  const canSubmit =
    warehouse > 0 && !!date && lines.some((l) => (Number(l.quantity) || 0) > 0)

  return (
    <Modal open={open} onClose={onClose} title={`Receive goods — ${po.number}`} icon={BoxArrowDown} size="2xl">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Select label="Warehouse" value={warehouse} onChange={(e) => setWarehouse(Number(e.target.value))}>
            <option value={0}>Select warehouse…</option>
            {(warehouses ?? []).map((w) => (
              <option key={w.id} value={w.id}>{w.code} · {w.name}</option>
            ))}
          </Select>
          <Input type="date" label="Date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-3 py-2.5">Line</th>
                <th className="px-3 py-2.5 text-right">Outstanding</th>
                <th className="px-3 py-2.5 w-32 text-right">Receive now</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-gray-500">Nothing outstanding on this PO</td>
                </tr>
              )}
              {lines.map((l, index) => (
                <tr key={l.po_line} className="border-t border-gray-100 dark:border-gray-700/50">
                  <td className="px-3 py-2">{l.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(l.outstanding)}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={l.outstanding}
                      value={l.quantity}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((p, i) => (i === index ? { ...p, quantity: e.target.value } : p))
                        )
                      }
                      className="w-full px-2 py-1.5 text-sm text-right tabular-nums rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          The GRN is created and posted in one step — stock and the GL update immediately.
        </p>

        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit} loading={mutation.isPending}>
            Receive &amp; Post GRN
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// PO detail page
// ---------------------------------------------------------------------------

export default function PurchaseOrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmApprove, setConfirmApprove] = useState(false)
  const [receiveOpen, setReceiveOpen] = useState(false)

  const { data: po } = useQuery({
    queryKey: qk.purchaseOrders.detail(id!),
    queryFn: () => purchaseOrdersApi.get(id!).then((r) => r.data as PurchaseOrder),
  })

  const { data: grns, isFetching: grnsFetching } = useQuery({
    queryKey: qk.grns.list({ po: id }),
    queryFn: () => grnsApi.list({ po: id }).then((r) => r.data as Paginated<GRN>),
    enabled: !!id,
  })
  const grnsRefreshing = grnsFetching && !!grns

  const { data: bills, isFetching: billsFetching } = useQuery({
    queryKey: qk.vendorBills.list({ po: id }),
    queryFn: () => vendorBillsApi.list({ po: id }).then((r) => r.data as Paginated<VendorBill>),
    enabled: !!id,
  })
  const billsRefreshing = billsFetching && !!bills

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: qk.purchaseOrders.all })
    queryClient.invalidateQueries({ queryKey: qk.grns.all })
    queryClient.invalidateQueries({ queryKey: qk.items.all })
    queryClient.invalidateQueries({ queryKey: qk.stockMoves.all })
    queryClient.invalidateQueries({ queryKey: qk.stockLevels.all })
    queryClient.invalidateQueries({ queryKey: qk.journals.all })
    queryClient.invalidateQueries({ queryKey: qk.accounts.all })
    queryClient.invalidateQueries({ queryKey: qk.reports.all })
  }

  const approveMutation = useMutation({
    mutationFn: () => purchaseOrdersApi.approve(id!),
    onSuccess: () => {
      showToast.success('Purchase order approved')
      queryClient.invalidateQueries({ queryKey: qk.purchaseOrders.all })
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to approve PO')),
  })

  if (!po) return <SkeletonCard />

  const canApprove = po.status === 'draft' || po.status === 'submitted'
  const canReceive = po.status === 'approved' || po.status === 'partially_received'

  return (
    <div className="space-y-6">
      <PageHeader
        title={po.number}
        description={`Purchase order for ${po.supplier_name}`}
        icon={ShoppingCart}
        backLink="/app/purchase-orders"
        actions={
          <div className="flex items-center gap-3">
            <PoStatusBadge status={po.status} />
            {canApprove && (
              <Button onClick={() => setConfirmApprove(true)} loading={approveMutation.isPending}>
                <CheckCircle className="w-4 h-4 mr-2" /> Approve
              </Button>
            )}
            {canReceive && (
              <Button onClick={() => setReceiveOpen(true)}>
                <BoxArrowDown className="w-4 h-4 mr-2" /> Receive Goods
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <span className="text-gray-500 block">Supplier</span>
          <Link to={`/app/suppliers/${po.supplier}`} className="text-primary-600 dark:text-primary-400 hover:underline">
            {po.supplier_name}
          </Link>
        </div>
        <div><span className="text-gray-500 block">Date</span>{po.date}</div>
        <div><span className="text-gray-500 block">Expected</span>{po.expected_date || '—'}</div>
        <div><span className="text-gray-500 block">Currency</span>{po.currency}</div>
        {po.notes && (
          <div className="col-span-2 md:col-span-4"><span className="text-gray-500 block">Notes</span>{po.notes}</div>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
            <tr>
              <th className="px-4 py-3">Item / Account</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3 text-right">Ordered</th>
              <th className="px-4 py-3 text-right">Received</th>
              <th className="px-4 py-3 text-right">Outstanding</th>
              <th className="px-4 py-3 text-right">Unit price</th>
              <th className="px-4 py-3 text-right">Line total</th>
            </tr>
          </thead>
          <tbody>
            {po.lines.map((line) => {
              const outstanding = Math.max(parseFloat(line.quantity) - parseFloat(line.qty_received), 0)
              return (
                <tr key={line.id} className="border-t border-gray-100 dark:border-gray-700/50">
                  <td className="px-4 py-2.5">
                    {line.item ? (
                      <Link to={`/app/items/${line.item}`} className="text-primary-600 dark:text-primary-400 hover:underline font-mono">
                        {line.item_code}
                      </Link>
                    ) : (
                      <span className="text-gray-500">Expense line</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 max-w-sm truncate">{line.description || '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(line.quantity)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(line.qty_received)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(outstanding)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(line.unit_price)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {money(parseFloat(line.quantity) * parseFloat(line.unit_price))}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold">
            <tr>
              <td className="px-4 py-3" colSpan={6}>Total ({po.currency})</td>
              <td className="px-4 py-3 text-right tabular-nums">{money(po.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Goods received notes</h3>
          <div className="relative">
            <RefreshingOverlay active={grnsRefreshing} />
            <div
              className={refreshingContentClass(
                grnsRefreshing,
                'rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/50'
              )}
            >
              {!grns && (
                <div className="px-4 py-3 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              )}
              {grns && grns.results.length === 0 && (
                <p className="px-4 py-5 text-sm text-gray-500 text-center">No GRNs yet</p>
              )}
              {(grns?.results ?? []).map((grn) => (
                <Link
                  key={grn.id}
                  to={`/app/grns/${grn.id}`}
                  className="flex items-center justify-between px-4 py-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <span className="font-mono text-primary-600 dark:text-primary-400">{grn.number}</span>
                  <span className="text-gray-500">{grn.date} · {grn.warehouse_code}</span>
                  <StatusBadge status={grn.status} />
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Vendor bills</h3>
          <div className="relative">
            <RefreshingOverlay active={billsRefreshing} />
            <div
              className={refreshingContentClass(
                billsRefreshing,
                'rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/50'
              )}
            >
              {!bills && (
                <div className="px-4 py-3 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              )}
              {bills && bills.results.length === 0 && (
                <p className="px-4 py-5 text-sm text-gray-500 text-center">No bills yet</p>
              )}
              {(bills?.results ?? []).map((bill) => (
                <Link
                  key={bill.id}
                  to={`/app/vendor-bills/${bill.id}`}
                  className="flex items-center justify-between px-4 py-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <span className="font-mono text-primary-600 dark:text-primary-400">{bill.number}</span>
                  <span className="tabular-nums">{money(bill.total)} {bill.currency}</span>
                  <StatusBadge status={bill.status} />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmApprove}
        onClose={() => setConfirmApprove(false)}
        onConfirm={() => { setConfirmApprove(false); approveMutation.mutate() }}
        title={`Approve ${po.number}?`}
        message="Approved orders can no longer be edited — goods can then be received against them."
        confirmText="Approve PO"
      />

      <ReceiveGoodsModal
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        po={po}
        onDone={invalidateAll}
      />
    </div>
  )
}
