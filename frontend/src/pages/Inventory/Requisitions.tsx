import { useEffect, useMemo, useState } from 'react'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardText, Plus, Trash, PaperPlaneTilt, Check, X, ArrowLineUp } from '@phosphor-icons/react'
import { departmentsApi, itemsApi, requisitionsApi, warehousesApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { usePagedList } from '@/hooks/usePaginatedQuery'
import { useUrlFilters, filtersToQuery, type FilterConfig } from '@/hooks/useUrlFilters'
import { useCan } from '@/hooks/useCan'
import { showToast, parseApiError } from '@/lib/toast'
import { formatDate } from '@/lib/utils'
import {
  AsyncSelect,
  Badge,
  Button,
  DataTable,
  FilterBar,
  FormRow,
  Input,
  Modal,
  ModalFooter,
  PageHeader,
  RefreshingOverlay,
  Select,
  Textarea,
  refreshingContentClass,
  type Column,
} from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import {
  REQUISITION_STATUS_LABELS,
  REQUISITION_STATUS_OPTIONS,
  REQUISITION_STATUS_VARIANTS,
  type Department,
  type Item,
  type Requisition,
  type Warehouse,
} from '@/types/inventory'
import { money } from '@/types/procurement'

const PAGE_SIZE = 25
const today = () => new Date().toISOString().slice(0, 10)

const FILTER_CONFIG: FilterConfig = [
  { type: 'search', placeholder: 'Search number or note…' },
  { type: 'chips', field: 'status', label: 'Status', options: REQUISITION_STATUS_OPTIONS },
  {
    type: 'select',
    field: 'warehouse',
    label: 'Warehouse',
    searchable: true,
    query: {
      queryKey: ['warehouses', 'facet-options'],
      queryFn: () => warehousesApi.list({ page_size: 500 }).then((r) => (r.data.results ?? r.data) as any[]),
      toOption: (row) => ({ value: String(row.id), label: `${row.code} · ${row.name}` }),
    },
  },
  {
    type: 'select',
    field: 'department',
    label: 'Department',
    searchable: true,
    query: {
      queryKey: ['departments', 'facet-options'],
      queryFn: () => departmentsApi.list({ page_size: 500 }).then((r) => (r.data.results ?? r.data) as any[]),
      toOption: (row) => ({ value: String(row.id), label: `${row.code} · ${row.name}` }),
    },
  },
]

// ---------------------------------------------------------------------------
// Shared data hooks
// ---------------------------------------------------------------------------

function useActiveWarehouses(enabled: boolean) {
  return useQuery({
    queryKey: qk.warehouses.list({ is_active: true }),
    queryFn: () => warehousesApi.list({ is_active: true, page_size: 500 }).then((r) => (r.data.results ?? r.data) as Warehouse[]),
    enabled,
  })
}

function useActiveDepartments(enabled: boolean) {
  return useQuery({
    queryKey: qk.departments.list({ is_active: true }),
    queryFn: () => departmentsApi.list({ is_active: true, page_size: 500 }).then((r) => (r.data.results ?? r.data) as Department[]),
    enabled,
  })
}

function useActiveItems(enabled: boolean) {
  return useQuery({
    queryKey: qk.items.list({ picker: 'requisition' }),
    queryFn: () => itemsApi.list({ is_active: true, page_size: 500 }).then((r) => (r.data.results ?? r.data) as Item[]),
    enabled,
  })
}

// ---------------------------------------------------------------------------
// New requisition modal
// ---------------------------------------------------------------------------

const createSchema = z.object({
  warehouse: z.coerce.number().min(1, 'Warehouse is required'),
  department: z.string().default(''),
  date: z.string().min(1, 'Date is required'),
  note: z.string().default(''),
  lines: z
    .array(
      z.object({
        item: z.coerce.number().min(1, 'Pick an item'),
        qty_requested: z.coerce.number().positive('Qty > 0'),
      })
    )
    .min(1, 'Add at least one line'),
})

type CreateValues = z.infer<typeof createSchema>

function NewRequisitionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data: warehouses } = useActiveWarehouses(open)
  const { data: departments } = useActiveDepartments(open)
  const { data: items } = useActiveItems(open)

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { warehouse: 0, department: '', date: today(), note: '', lines: [{ item: 0, qty_requested: 0 }] },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })

  useEffect(() => {
    if (open) reset({ warehouse: 0, department: '', date: today(), note: '', lines: [{ item: 0, qty_requested: 0 }] })
  }, [open, reset])

  const itemOptions = useMemo(
    () => (items ?? []).map((i) => ({ value: i.id, label: `${i.code} · ${i.name}`, description: i.uom })),
    [items]
  )

  const mutation = useMutation({
    mutationFn: (values: CreateValues) =>
      requisitionsApi.create({
        warehouse: values.warehouse,
        department: values.department ? Number(values.department) : undefined,
        date: values.date,
        note: values.note,
        lines: values.lines.map((l) => ({ item: l.item, qty_requested: l.qty_requested.toFixed(2) })),
      }),
    onSuccess: (r) => {
      showToast.success(`Requisition ${(r.data as Requisition).number} created`)
      queryClient.invalidateQueries({ queryKey: qk.requisitions.all })
      onClose()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to create requisition')),
  })

  return (
    <Modal open={open} onClose={onClose} title="New requisition" icon={ClipboardText} size="2xl">
      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
        <FormRow>
          <Select label="Warehouse" error={errors.warehouse?.message} {...register('warehouse')}>
            <option value={0}>Select warehouse…</option>
            {(warehouses ?? []).map((w) => (
              <option key={w.id} value={w.id}>{w.code} · {w.name}</option>
            ))}
          </Select>
          <Select label="Department (optional)" error={errors.department?.message} {...register('department')}>
            <option value="">No department</option>
            {(departments ?? []).map((d) => (
              <option key={d.id} value={String(d.id)}>{d.code} · {d.name}</option>
            ))}
          </Select>
        </FormRow>
        <FormRow>
          <Input type="date" label="Date" error={errors.date?.message} {...register('date')} />
          <Input label="Note (optional)" error={errors.note?.message} {...register('note')} />
        </FormRow>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Lines</p>
            <Button type="button" variant="secondary" size="sm" onClick={() => append({ item: 0, qty_requested: 0 })}>
              <Plus className="w-4 h-4 mr-1" /> Add line
            </Button>
          </div>
          {typeof errors.lines?.message === 'string' && (
            <p className="text-xs text-red-600">{errors.lines.message}</p>
          )}
          <div className="space-y-2">
            {fields.map((field, index) => (
              <div key={field.id} className="flex items-start gap-2">
                <div className="flex-1">
                  <Controller
                    control={control}
                    name={`lines.${index}.item`}
                    render={({ field: f }) => (
                      <AsyncSelect
                        placeholder="Search item…"
                        value={f.value || null}
                        onChange={(v) => f.onChange(Number(v) || 0)}
                        options={itemOptions}
                        searchable
                        error={errors.lines?.[index]?.item?.message}
                        emptyMessage="No items"
                      />
                    )}
                  />
                </div>
                <div className="w-32">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Qty"
                    error={errors.lines?.[index]?.qty_requested?.message}
                    {...register(`lines.${index}.qty_requested`)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => (fields.length > 1 ? remove(index) : undefined)}
                  disabled={fields.length === 1}
                  className="mt-2 p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Remove line"
                >
                  <Trash className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          Creates a draft. Submit it for approval from the requisition's detail view.
        </p>

        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={mutation.isPending}>Create draft</Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Approve modal (optionally edit approved qty per line)
// ---------------------------------------------------------------------------

function ApproveModal({
  requisition,
  open,
  onClose,
  onApplied,
}: {
  requisition: Requisition
  open: boolean
  onClose: () => void
  onApplied: (updated: Requisition) => void
}) {
  const queryClient = useQueryClient()
  const [approvals, setApprovals] = useState<Record<number, string>>({})

  useEffect(() => {
    if (open) {
      const init: Record<number, string> = {}
      requisition.lines.forEach((l) => {
        init[l.id] = l.qty_requested
      })
      setApprovals(init)
    }
  }, [open, requisition])

  const mutation = useMutation({
    mutationFn: () => {
      const map: Record<string, string> = {}
      requisition.lines.forEach((l) => {
        map[String(l.id)] = approvals[l.id] ?? l.qty_requested
      })
      return requisitionsApi.approve(requisition.id, map)
    },
    onSuccess: (r) => {
      showToast.success('Requisition approved')
      queryClient.invalidateQueries({ queryKey: qk.requisitions.all })
      onApplied(r.data as Requisition)
      onClose()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to approve requisition')),
  })

  return (
    <Modal open={open} onClose={onClose} title={`Approve ${requisition.number}`} icon={Check} size="lg">
      <div className="space-y-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Approved quantities default to what was requested — adjust any line before approving.
        </p>
        <div className="space-y-2">
          {requisition.lines.map((l) => (
            <div key={l.id} className="flex items-center gap-3">
              <div className="flex-1 text-sm">
                <span className="font-mono text-primary-600 dark:text-primary-400">{l.item_code}</span> {l.item_name}
                <span className="block text-xs text-gray-400">Requested {money(l.qty_requested)}</span>
              </div>
              <div className="w-32">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={approvals[l.id] ?? ''}
                  onChange={(e) => setApprovals((prev) => ({ ...prev, [l.id]: e.target.value }))}
                />
              </div>
            </div>
          ))}
        </div>
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="button" loading={mutation.isPending} onClick={() => mutation.mutate()}>Approve</Button>
        </ModalFooter>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Reject modal
// ---------------------------------------------------------------------------

function RejectModal({
  requisition,
  open,
  onClose,
  onApplied,
}: {
  requisition: Requisition
  open: boolean
  onClose: () => void
  onApplied: (updated: Requisition) => void
}) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (open) setReason('')
  }, [open])

  const mutation = useMutation({
    mutationFn: () => requisitionsApi.reject(requisition.id, reason),
    onSuccess: (r) => {
      showToast.success('Requisition rejected')
      queryClient.invalidateQueries({ queryKey: qk.requisitions.all })
      onApplied(r.data as Requisition)
      onClose()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to reject requisition')),
  })

  return (
    <Modal open={open} onClose={onClose} title={`Reject ${requisition.number}`} icon={X} size="md">
      <div className="space-y-4">
        <Textarea
          label="Reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why is this requisition being rejected?"
        />
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="danger" loading={mutation.isPending} disabled={!reason.trim()} onClick={() => mutation.mutate()}>
            Reject
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Detail modal (lines + workflow)
// ---------------------------------------------------------------------------

function RequisitionDetailModal({
  requisition,
  open,
  onClose,
  onChange,
}: {
  requisition: Requisition
  open: boolean
  onClose: () => void
  onChange: (updated: Requisition) => void
}) {
  const queryClient = useQueryClient()
  const canEdit = useCan('inventory', 'edit')
  const canApprove = useCan('inventory', 'approve')
  const canPost = useCan('inventory', 'post')
  const [approveOpen, setApproveOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)

  const invalidateAfterIssue = () => {
    queryClient.invalidateQueries({ queryKey: qk.requisitions.all })
    queryClient.invalidateQueries({ queryKey: qk.items.all })
    queryClient.invalidateQueries({ queryKey: qk.stockLevels.all })
    queryClient.invalidateQueries({ queryKey: qk.stockMoves.all })
    queryClient.invalidateQueries({ queryKey: qk.journals.all })
    queryClient.invalidateQueries({ queryKey: qk.reports.all })
  }

  const submitMutation = useMutation({
    mutationFn: () => requisitionsApi.submit(requisition.id),
    onSuccess: (r) => {
      showToast.success('Requisition submitted for approval')
      queryClient.invalidateQueries({ queryKey: qk.requisitions.all })
      onChange(r.data as Requisition)
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to submit requisition')),
  })

  const issueMutation = useMutation({
    mutationFn: () => requisitionsApi.issue(requisition.id),
    onSuccess: (r) => {
      showToast.success(`Requisition ${requisition.number} issued`)
      invalidateAfterIssue()
      onChange(r.data as Requisition)
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to issue requisition')),
  })

  const status = requisition.status
  const canSubmit = status === 'draft'
  const canDoApprove = status === 'submitted'
  const canReject = status === 'submitted' || status === 'approved'
  const canIssue = status === 'approved' || status === 'partially_issued'
  const busy = submitMutation.isPending || issueMutation.isPending

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={`Requisition ${requisition.number}`}
        description={`${requisition.warehouse_code}${requisition.department_name ? ` · ${requisition.department_name}` : ''} · ${formatDate(requisition.date)}`}
        icon={ClipboardText}
        size="2xl"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge variant={REQUISITION_STATUS_VARIANTS[status]}>{REQUISITION_STATUS_LABELS[status]}</Badge>
            {requisition.requested_by_email && (
              <span className="text-gray-500 dark:text-gray-400">Requested by {requisition.requested_by_email}</span>
            )}
          </div>

          {requisition.note && (
            <p className="text-sm text-gray-600 dark:text-gray-300">{requisition.note}</p>
          )}
          {requisition.review_note && (
            <p className="text-sm rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 px-3 py-2">
              Review note: {requisition.review_note}
            </p>
          )}

          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3 text-right">Requested</th>
                  <th className="px-4 py-3 text-right">Approved</th>
                  <th className="px-4 py-3 text-right">Issued</th>
                </tr>
              </thead>
              <tbody>
                {requisition.lines.map((l) => (
                  <tr key={l.id} className="border-t border-gray-100 dark:border-gray-700/50">
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-primary-600 dark:text-primary-400">{l.item_code}</span> {l.item_name}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{money(l.qty_requested)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{money(l.qty_approved)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{money(l.qty_issued)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ModalFooter>
            {canReject && canApprove && (
              <Button variant="secondary" type="button" onClick={() => setRejectOpen(true)} disabled={busy}>
                <X className="w-4 h-4 mr-2" /> Reject
              </Button>
            )}
            {canSubmit && canEdit && (
              <Button type="button" onClick={() => submitMutation.mutate()} loading={submitMutation.isPending}>
                <PaperPlaneTilt className="w-4 h-4 mr-2" /> Submit
              </Button>
            )}
            {canDoApprove && canApprove && (
              <Button type="button" onClick={() => setApproveOpen(true)} disabled={busy}>
                <Check className="w-4 h-4 mr-2" /> Approve
              </Button>
            )}
            {canIssue && canPost && (
              <Button type="button" onClick={() => issueMutation.mutate()} loading={issueMutation.isPending}>
                <ArrowLineUp className="w-4 h-4 mr-2" /> Issue
              </Button>
            )}
          </ModalFooter>
        </div>
      </Modal>

      <ApproveModal requisition={requisition} open={approveOpen} onClose={() => setApproveOpen(false)} onApplied={onChange} />
      <RejectModal requisition={requisition} open={rejectOpen} onClose={() => setRejectOpen(false)} onApplied={onChange} />
    </>
  )
}

// ---------------------------------------------------------------------------
// List page
// ---------------------------------------------------------------------------

export default function Requisitions() {
  const canCreate = useCan('inventory', 'create')
  const filters = useUrlFilters(FILTER_CONFIG)
  const [page, setPage] = useState(1)
  const [newOpen, setNewOpen] = useState(false)
  const [selected, setSelected] = useState<Requisition | null>(null)

  const filterSignature = JSON.stringify(filters.params)
  useEffect(() => {
    setPage(1)
  }, [filterSignature])

  const { data, results, total, isFetching } = usePagedList<Requisition>({
    keyFor: (p) => qk.requisitions.list({ ...filters.params, page: p }),
    fetchPage: (p) => requisitionsApi.list(filtersToQuery(filters.params, { page: p })).then((r) => r.data as Paginated<Requisition>),
    page,
    pageSize: PAGE_SIZE,
  })
  const isRefreshing = isFetching && !!data

  const columns: Column<Requisition>[] = [
    { key: 'number', header: 'Number', render: (r) => <span className="font-mono text-primary-600 dark:text-primary-400">{r.number}</span> },
    { key: 'warehouse', header: 'Warehouse', render: (r) => <span className="font-mono text-xs">{r.warehouse_code}</span> },
    { key: 'department', header: 'Department', render: (r) => r.department_name || '—' },
    { key: 'date', header: 'Date', render: (r) => formatDate(r.date) },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <Badge variant={REQUISITION_STATUS_VARIANTS[r.status]} size="sm">{REQUISITION_STATUS_LABELS[r.status]}</Badge>,
    },
    { key: 'requested_by', header: 'Requested by', render: (r) => r.requested_by_email || '—' },
    { key: 'lines', header: 'Lines', align: 'right', render: (r) => <span className="tabular-nums">{r.lines.length}</span> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Requisitions"
        description="Department stock requests — submit, approve and issue against warehouse stock"
        icon={ClipboardText}
        actions={
          canCreate ? (
            <Button onClick={() => setNewOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> New requisition
            </Button>
          ) : undefined
        }
      />

      <FilterBar config={FILTER_CONFIG} filters={filters} />

      <div className="relative">
        <RefreshingOverlay active={isRefreshing} />
        <div className={refreshingContentClass(isRefreshing)}>
          <DataTable<Requisition>
            rowKey={(r) => r.id}
            columns={columns}
            data={results}
            loading={!data}
            onRowClick={(r) => setSelected(r)}
            emptyTitle="No requisitions"
            emptyDescription="Department stock requests will appear here."
            pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
          />
        </div>
      </div>

      {newOpen && <NewRequisitionModal open={newOpen} onClose={() => setNewOpen(false)} />}
      {selected && (
        <RequisitionDetailModal
          requisition={selected}
          open={!!selected}
          onClose={() => setSelected(null)}
          onChange={setSelected}
        />
      )}
    </div>
  )
}
