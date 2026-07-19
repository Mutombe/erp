import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle, Bank, ListChecks, Plus, Scales, Wallet } from '@phosphor-icons/react'
import { bankAccountsApi, bankReconciliationsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { showToast, parseApiError } from '@/lib/toast'
import {
  Badge,
  Button,
  ConfirmDialog,
  FormRow,
  Input,
  Modal,
  ModalFooter,
  PageHeader,
  Select,
  SkeletonCard,
  StatsCard,
} from '@/components/ui'
import type { BankAccount, Paginated } from '@/types/accounting'

interface ReconciliationItem {
  id: number
  is_ticked: boolean
  date: string
  description: string
  journal_number: string
  journal_id: number
  debit: string
  credit: string
}

interface Reconciliation {
  id: number
  bank_account: number
  bank_account_name: string
  start_date: string
  end_date: string
  statement_balance: string
  book_balance: string
  status: 'in_progress' | 'completed'
  opening_balance: number | string
  ticked_total: number | string
  reconciled_balance: number | string
  difference: number | string
  items: ReconciliationItem[]
}

const money = (v: number | string) =>
  Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function ReconStatusBadge({ status }: { status: Reconciliation['status'] }) {
  return (
    <Badge variant={status === 'completed' ? 'success' : 'warning'} size="sm" dot>
      {status === 'completed' ? 'Completed' : 'In progress'}
    </Badge>
  )
}

const newReconSchema = z.object({
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().min(1, 'End date is required'),
  statement_balance: z.coerce.number(),
})

type NewReconValues = z.infer<typeof newReconSchema>

function NewReconciliationModal({
  open,
  onClose,
  accountId,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  accountId: string
  onCreated: (id: number) => void
}) {
  const queryClient = useQueryClient()
  const monthStart = `${new Date().toISOString().slice(0, 7)}-01`
  const today = new Date().toISOString().slice(0, 10)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<NewReconValues>({
    resolver: zodResolver(newReconSchema),
    defaultValues: { start_date: monthStart, end_date: today, statement_balance: 0 },
  })

  const mutation = useMutation({
    mutationFn: (values: NewReconValues) =>
      bankReconciliationsApi.create({
        bank_account: Number(accountId),
        start_date: values.start_date,
        end_date: values.end_date,
        statement_balance: values.statement_balance.toFixed(2),
      }),
    onSuccess: (r) => {
      showToast.success('Reconciliation started')
      queryClient.invalidateQueries({ queryKey: qk.bankReconciliations.all })
      reset({ start_date: monthStart, end_date: today, statement_balance: 0 })
      onClose()
      onCreated((r.data as Reconciliation).id)
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to start reconciliation')),
  })

  return (
    <Modal open={open} onClose={onClose} title="New Reconciliation" icon={Scales}>
      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
        <FormRow>
          <Input type="date" label="Start date" error={errors.start_date?.message} {...register('start_date')} />
          <Input type="date" label="End date" error={errors.end_date?.message} {...register('end_date')} />
        </FormRow>
        <Input
          type="number"
          step="0.01"
          label="Statement closing balance"
          error={errors.statement_balance?.message}
          {...register('statement_balance')}
        />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          All unreconciled bank journal lines up to the end date will be pulled in for ticking.
        </p>
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={mutation.isPending}>Start Reconciliation</Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}

function ReconciliationWorkspace({ reconId }: { reconId: number }) {
  const queryClient = useQueryClient()
  const [confirmForce, setConfirmForce] = useState(false)

  const { data: recon, isLoading } = useQuery({
    queryKey: qk.bankReconciliations.detail(reconId),
    queryFn: () => bankReconciliationsApi.get(reconId).then((r) => r.data as Reconciliation),
  })

  const toggleMutation = useMutation({
    mutationFn: (itemId: number) => bankReconciliationsApi.toggleItem(reconId, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.bankReconciliations.detail(reconId) })
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to toggle item')),
  })

  const completeMutation = useMutation({
    mutationFn: (force: boolean) => bankReconciliationsApi.complete(reconId, force),
    onSuccess: () => {
      showToast.success('Reconciliation completed')
      queryClient.invalidateQueries({ queryKey: qk.bankReconciliations.all })
      queryClient.invalidateQueries({ queryKey: qk.bankAccounts.all })
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to complete reconciliation')),
  })

  if (isLoading || !recon) return <SkeletonCard />

  const difference = Number(recon.difference)
  const balanced = difference === 0
  const completed = recon.status === 'completed'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            {recon.bank_account_name} · {recon.start_date} — {recon.end_date}
          </h3>
          <ReconStatusBadge status={recon.status} />
        </div>
        {!completed && (
          <Button
            onClick={() => (balanced ? completeMutation.mutate(false) : setConfirmForce(true))}
            loading={completeMutation.isPending}
            variant={balanced ? 'primary' : 'secondary'}
          >
            <CheckCircle className="w-4 h-4 mr-2" /> Complete Reconciliation
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Statement balance"
          value={money(recon.statement_balance)}
          subtitle="Per the bank statement"
          icon={Bank}
          color="blue"
        />
        <StatsCard
          title="Opening (last reconciled)"
          value={money(recon.opening_balance)}
          subtitle="Carried from the previous reconciliation"
          icon={Wallet}
          color="purple"
        />
        <StatsCard
          title="Ticked total"
          value={money(recon.ticked_total)}
          subtitle={`Reconciled balance ${money(recon.reconciled_balance)}`}
          icon={ListChecks}
          color="cyan"
        />
        <StatsCard
          title="Difference"
          value={money(recon.difference)}
          subtitle={balanced ? 'Balanced — ready to complete' : 'Tick outstanding items to clear'}
          icon={Scales}
          color={balanced ? 'green' : 'red'}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
            <tr>
              <th className="px-4 py-3 w-12">✓</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Journal</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3 text-right">Debit</th>
              <th className="px-4 py-3 text-right">Credit</th>
            </tr>
          </thead>
          <tbody>
            {recon.items.map((item) => (
              <tr
                key={item.id}
                className={`border-t border-gray-100 dark:border-gray-700/50 ${
                  item.is_ticked ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : ''
                }`}
              >
                <td className="px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={item.is_ticked}
                    disabled={completed || toggleMutation.isPending}
                    onChange={() => toggleMutation.mutate(item.id)}
                    className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 disabled:opacity-50"
                    aria-label={`Tick ${item.journal_number}`}
                  />
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">{item.date}</td>
                <td className="px-4 py-2.5 font-mono text-xs">
                  <Link to={`/app/journals/${item.journal_id}`} className="text-primary-600 dark:text-primary-400 hover:underline">
                    {item.journal_number}
                  </Link>
                </td>
                <td className="px-4 py-2.5 max-w-sm truncate">{item.description || '—'}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {Number(item.debit) !== 0 ? money(item.debit) : ''}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {Number(item.credit) !== 0 ? money(item.credit) : ''}
                </td>
              </tr>
            ))}
            {recon.items.length === 0 && (
              <tr className="border-t border-gray-100 dark:border-gray-700/50">
                <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                  No unreconciled bank journal lines up to {recon.end_date}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={confirmForce}
        onClose={() => setConfirmForce(false)}
        onConfirm={() => { setConfirmForce(false); completeMutation.mutate(true) }}
        title="Complete with a difference?"
        message={`This reconciliation is out by ${money(difference)}. Completing anyway will accept the statement balance and carry the difference forward.`}
        confirmText="Force complete"
        variant="warning"
      />
    </div>
  )
}

export default function BankReconciliation() {
  const [searchParams, setSearchParams] = useSearchParams()
  const accountId = searchParams.get('account') ?? ''
  const [activeId, setActiveId] = useState<number | null>(null)
  const [newOpen, setNewOpen] = useState(false)

  const { data: bankAccounts } = useQuery({
    queryKey: qk.bankAccounts.list(),
    queryFn: () => bankAccountsApi.list().then((r) => r.data as BankAccount[]),
  })

  const { data: recons } = useQuery({
    queryKey: qk.bankReconciliations.list({ bank_account: accountId }),
    queryFn: () =>
      bankReconciliationsApi
        .list({ bank_account: accountId, page_size: 100 })
        .then((r) => (r.data as Paginated<Reconciliation>).results),
    enabled: !!accountId,
  })

  const selectAccount = (value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set('account', value)
    else next.delete('account')
    setSearchParams(next, { replace: true })
    setActiveId(null)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bank Reconciliation"
        description="Tick off bank journal lines against the statement, Sage style"
        icon={Scales}
        actions={
          accountId ? (
            <Button onClick={() => setNewOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> New Reconciliation
            </Button>
          ) : undefined
        }
      />

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-4">
        <div className="max-w-sm">
          <Select
            label="Bank account"
            value={accountId}
            onChange={(e) => selectAccount(e.target.value)}
            placeholder="Select bank account…"
          >
            {(bankAccounts ?? []).map((b) => (
              <option key={b.id} value={String(b.id)}>{b.code} · {b.name} ({b.currency})</option>
            ))}
          </Select>
        </div>

        {accountId && (
          <div className="flex items-center gap-2 flex-wrap">
            {(recons ?? []).length === 0 && (
              <p className="text-sm text-gray-500">No reconciliations for this account yet.</p>
            )}
            {(recons ?? []).map((r) => (
              <button
                key={r.id}
                onClick={() => setActiveId(r.id)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-full border transition-colors ${
                  activeId === r.id
                    ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                    : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <span className="tabular-nums">{r.end_date}</span>
                <ReconStatusBadge status={r.status} />
              </button>
            ))}
          </div>
        )}
      </div>

      {!accountId && (
        <p className="text-sm text-gray-500">
          Select a bank account to view or start a reconciliation.
        </p>
      )}

      {activeId && <ReconciliationWorkspace key={activeId} reconId={activeId} />}

      {accountId && (
        <NewReconciliationModal
          open={newOpen}
          onClose={() => setNewOpen(false)}
          accountId={accountId}
          onCreated={setActiveId}
        />
      )}
    </div>
  )
}
