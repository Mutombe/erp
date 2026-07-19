import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  ArrowsLeftRight,
  ArrowLineUp,
  CurrencyDollar,
  Package,
  BoxArrowDown,
  Wallet,
} from '@phosphor-icons/react'
import { itemsApi, stockLevelsApi, stockMovesApi, warehousesApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { showToast, parseApiError } from '@/lib/toast'
import {
  Badge,
  Button,
  FormRow,
  Input,
  Modal,
  ModalFooter,
  PageHeader,
  Select,
  SkeletonCard,
  StatsCard,
} from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import {
  MOVE_TYPE_LABELS,
  MOVE_TYPE_VARIANTS,
  isLowStock,
  type Item,
  type StockLevel,
  type StockMove,
  type Warehouse,
} from '@/types/inventory'
import { money } from '@/types/procurement'

const today = () => new Date().toISOString().slice(0, 10)

// ---------------------------------------------------------------------------
// Stock operation modals
// ---------------------------------------------------------------------------

const receiveSchema = z.object({
  warehouse: z.coerce.number().min(1, 'Warehouse is required'),
  quantity: z.coerce.number().positive('Quantity must be positive'),
  unit_cost_base: z.coerce.number().min(0, 'Unit cost is required'),
  date: z.string().min(1, 'Date is required'),
})

function ReceiveStockModal({
  open,
  onClose,
  itemId,
  warehouses,
  onDone,
}: {
  open: boolean
  onClose: () => void
  itemId: number
  warehouses: Warehouse[]
  onDone: () => void
}) {
  type Values = z.infer<typeof receiveSchema>
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(receiveSchema),
    defaultValues: { warehouse: 0, quantity: 0, unit_cost_base: 0, date: today() },
  })

  const mutation = useMutation({
    mutationFn: (values: Values) =>
      stockMovesApi.receive({
        item: itemId,
        warehouse: values.warehouse,
        quantity: values.quantity.toFixed(2),
        unit_cost_base: values.unit_cost_base.toFixed(4),
        date: values.date,
      }),
    onSuccess: (r) => {
      showToast.success(`Stock received — ${r.data.number}`)
      onDone()
      reset({ warehouse: 0, quantity: 0, unit_cost_base: 0, date: today() })
      onClose()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to receive stock')),
  })

  return (
    <Modal open={open} onClose={onClose} title="Receive Stock" icon={BoxArrowDown}>
      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
        <Select label="Warehouse" error={errors.warehouse?.message} {...register('warehouse')}>
          <option value={0}>Select warehouse…</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>{w.code} · {w.name}</option>
          ))}
        </Select>
        <FormRow>
          <Input type="number" step="0.01" min="0" label="Quantity" error={errors.quantity?.message} {...register('quantity')} />
          <Input type="number" step="0.0001" min="0" label="Unit cost (base)" error={errors.unit_cost_base?.message} {...register('unit_cost_base')} />
        </FormRow>
        <Input type="date" label="Date" error={errors.date?.message} {...register('date')} />
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={mutation.isPending}>Receive Stock</Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}

const issueSchema = z.object({
  warehouse: z.coerce.number().min(1, 'Warehouse is required'),
  quantity: z.coerce.number().positive('Quantity must be positive'),
  date: z.string().min(1, 'Date is required'),
  department: z.string().default(''),
  reason: z.string().default(''),
})

function IssueStockModal({
  open,
  onClose,
  itemId,
  warehouses,
  onDone,
}: {
  open: boolean
  onClose: () => void
  itemId: number
  warehouses: Warehouse[]
  onDone: () => void
}) {
  type Values = z.infer<typeof issueSchema>
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(issueSchema),
    defaultValues: { warehouse: 0, quantity: 0, date: today(), department: '', reason: '' },
  })

  const mutation = useMutation({
    mutationFn: (values: Values) =>
      stockMovesApi.issue({
        item: itemId,
        warehouse: values.warehouse,
        quantity: values.quantity.toFixed(2),
        date: values.date,
        department: values.department,
        reason: values.reason,
      }),
    onSuccess: (r) => {
      showToast.success(`Stock issued — ${r.data.number}`)
      onDone()
      reset({ warehouse: 0, quantity: 0, date: today(), department: '', reason: '' })
      onClose()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to issue stock')),
  })

  return (
    <Modal open={open} onClose={onClose} title="Issue Stock" icon={ArrowLineUp}>
      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
        <Select label="Warehouse" error={errors.warehouse?.message} {...register('warehouse')}>
          <option value={0}>Select warehouse…</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>{w.code} · {w.name}</option>
          ))}
        </Select>
        <FormRow>
          <Input type="number" step="0.01" min="0" label="Quantity" error={errors.quantity?.message} {...register('quantity')} />
          <Input type="date" label="Date" error={errors.date?.message} {...register('date')} />
        </FormRow>
        <FormRow>
          <Input label="Department" placeholder="e.g. Science Dept" error={errors.department?.message} {...register('department')} />
          <Input label="Reason" placeholder="e.g. classroom supplies" error={errors.reason?.message} {...register('reason')} />
        </FormRow>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Issuing posts a consumption journal at the item's moving-average cost.
        </p>
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={mutation.isPending}>Issue Stock</Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}

const transferSchema = z
  .object({
    warehouse_from: z.coerce.number().min(1, 'Source warehouse is required'),
    warehouse_to: z.coerce.number().min(1, 'Destination warehouse is required'),
    quantity: z.coerce.number().positive('Quantity must be positive'),
    date: z.string().min(1, 'Date is required'),
  })
  .refine((v) => v.warehouse_from !== v.warehouse_to, {
    message: 'Source and destination must differ',
    path: ['warehouse_to'],
  })

function TransferStockModal({
  open,
  onClose,
  itemId,
  warehouses,
  onDone,
}: {
  open: boolean
  onClose: () => void
  itemId: number
  warehouses: Warehouse[]
  onDone: () => void
}) {
  type Values = z.infer<typeof transferSchema>
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(transferSchema),
    defaultValues: { warehouse_from: 0, warehouse_to: 0, quantity: 0, date: today() },
  })

  const mutation = useMutation({
    mutationFn: (values: Values) =>
      stockMovesApi.transferStock({
        item: itemId,
        warehouse_from: values.warehouse_from,
        warehouse_to: values.warehouse_to,
        quantity: values.quantity.toFixed(2),
        date: values.date,
      }),
    onSuccess: (r) => {
      showToast.success(`Stock transferred — ${r.data.number}`)
      onDone()
      reset({ warehouse_from: 0, warehouse_to: 0, quantity: 0, date: today() })
      onClose()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to transfer stock')),
  })

  return (
    <Modal open={open} onClose={onClose} title="Transfer Stock" icon={ArrowsLeftRight}>
      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
        <FormRow>
          <Select label="From warehouse" error={errors.warehouse_from?.message} {...register('warehouse_from')}>
            <option value={0}>Select warehouse…</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.code} · {w.name}</option>
            ))}
          </Select>
          <Select label="To warehouse" error={errors.warehouse_to?.message} {...register('warehouse_to')}>
            <option value={0}>Select warehouse…</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.code} · {w.name}</option>
            ))}
          </Select>
        </FormRow>
        <FormRow>
          <Input type="number" step="0.01" min="0" label="Quantity" error={errors.quantity?.message} {...register('quantity')} />
          <Input type="date" label="Date" error={errors.date?.message} {...register('date')} />
        </FormRow>
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={mutation.isPending}>Transfer Stock</Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Item detail page
// ---------------------------------------------------------------------------

export default function ItemDetail() {
  const { id } = useParams()
  const queryClient = useQueryClient()
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [issueOpen, setIssueOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)

  const { data: item, isLoading } = useQuery({
    queryKey: qk.items.detail(id!),
    queryFn: () => itemsApi.get(id!).then((r) => r.data as Item),
  })

  const { data: levels } = useQuery({
    queryKey: qk.stockLevels.list({ item: id }),
    queryFn: () =>
      stockLevelsApi.list({ item: id, page_size: 100 }).then((r) => r.data as Paginated<StockLevel>),
    enabled: !!id,
  })

  const { data: moves } = useQuery({
    queryKey: qk.stockMoves.list({ item: id }),
    queryFn: () => stockMovesApi.list({ item: id }).then((r) => r.data as Paginated<StockMove>),
    enabled: !!id,
  })

  const { data: warehouses } = useQuery({
    queryKey: qk.warehouses.list({ is_active: true }),
    queryFn: () => warehousesApi.list({ is_active: true }).then((r) => r.data as Warehouse[]),
  })

  // Stock ops touch the GL — invalidate everything a posting can move.
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: qk.items.all })
    queryClient.invalidateQueries({ queryKey: qk.stockMoves.all })
    queryClient.invalidateQueries({ queryKey: qk.stockLevels.all })
    queryClient.invalidateQueries({ queryKey: qk.journals.all })
    queryClient.invalidateQueries({ queryKey: qk.accounts.all })
    queryClient.invalidateQueries({ queryKey: qk.reports.all })
  }

  if (isLoading || !item) return <SkeletonCard />

  const qty = parseFloat(item.qty_on_hand)
  const avgCost = parseFloat(item.avg_cost)

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${item.code} · ${item.name}`}
        description={`${item.category_name || 'Uncategorised'} · ${item.item_type} · per ${item.uom}`}
        icon={Package}
        backLink="/app/items"
        actions={
          <div className="flex items-center gap-2">
            {isLowStock(item) && <Badge variant="danger">Low stock</Badge>}
            {!item.is_active && <Badge variant="default">Inactive</Badge>}
            <Button variant="secondary" onClick={() => setIssueOpen(true)}>
              <ArrowLineUp className="w-4 h-4 mr-2" /> Issue
            </Button>
            <Button variant="secondary" onClick={() => setTransferOpen(true)}>
              <ArrowsLeftRight className="w-4 h-4 mr-2" /> Transfer
            </Button>
            <Button onClick={() => setReceiveOpen(true)}>
              <BoxArrowDown className="w-4 h-4 mr-2" /> Receive Stock
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatsCard
          title="Quantity on hand"
          value={money(qty)}
          subtitle={`Reorder level ${money(item.reorder_level)}`}
          icon={Package}
          color="blue"
        />
        <StatsCard title="Average cost" value={money(avgCost)} subtitle="Moving average, base currency" icon={CurrencyDollar} color="purple" />
        <StatsCard title="Total stock value" value={money(qty * avgCost)} subtitle="qty × avg cost" icon={Wallet} color="green" />
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Stock by warehouse</h3>
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Warehouse</th>
                <th className="px-4 py-3 text-right">Quantity</th>
                <th className="px-4 py-3 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {(levels?.results ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-gray-500">No stock on hand</td>
                </tr>
              )}
              {(levels?.results ?? []).map((l) => (
                <tr key={l.id} className="border-t border-gray-100 dark:border-gray-700/50">
                  <td className="px-4 py-2.5">
                    <Link to={`/app/warehouses/${l.warehouse}`} className="text-primary-600 dark:text-primary-400 hover:underline">
                      <span className="font-mono">{l.warehouse_code}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(l.quantity)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(parseFloat(l.quantity) * avgCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Recent stock moves</h3>
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Number</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">From → To</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Unit cost</th>
                <th className="px-4 py-3 text-right">Total (base)</th>
                <th className="px-4 py-3">Journal</th>
              </tr>
            </thead>
            <tbody>
              {(moves?.results ?? []).length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-gray-500">No stock moves yet</td>
                </tr>
              )}
              {(moves?.results ?? []).map((m) => (
                <tr key={m.id} className="border-t border-gray-100 dark:border-gray-700/50">
                  <td className="px-4 py-2.5 font-mono">{m.number}</td>
                  <td className="px-4 py-2.5">{m.date}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={MOVE_TYPE_VARIANTS[m.move_type]} size="sm">{MOVE_TYPE_LABELS[m.move_type]}</Badge>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {m.warehouse_from_code || '—'} → {m.warehouse_to_code || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(m.quantity)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(m.unit_cost)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(m.total_cost_base)}</td>
                  <td className="px-4 py-2.5">
                    {m.journal ? (
                      <Link to={`/app/journals/${m.journal}`} className="text-primary-600 dark:text-primary-400 hover:underline font-mono">
                        {m.journal_number}
                      </Link>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ReceiveStockModal
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        itemId={item.id}
        warehouses={warehouses ?? []}
        onDone={invalidateAll}
      />
      <IssueStockModal
        open={issueOpen}
        onClose={() => setIssueOpen(false)}
        itemId={item.id}
        warehouses={warehouses ?? []}
        onDone={invalidateAll}
      />
      <TransferStockModal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        itemId={item.id}
        warehouses={warehouses ?? []}
        onDone={invalidateAll}
      />
    </div>
  )
}
