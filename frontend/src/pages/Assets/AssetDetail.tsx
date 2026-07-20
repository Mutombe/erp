import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { Bank, XSquare, TrendDown, Wallet } from '@phosphor-icons/react'
import { assetsApi, bankAccountsApi, depreciationRunsApi } from '@/services/api'
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
  SkeletonCard,
  SkeletonTable,
  StatsCard,
  StatusBadge,
  refreshingContentClass,
} from '@/components/ui'
import type { BankAccount, Paginated } from '@/types/accounting'
import { ASSET_STATUS_LABELS, type Asset, type DepreciationRun } from '@/types/assets'

const money = (v: string | number | null | undefined) =>
  Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function DisposeModal({
  asset,
  open,
  onClose,
}: {
  asset: Asset
  open: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [proceeds, setProceeds] = useState('0')
  const [bankAccount, setBankAccount] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [formError, setFormError] = useState('')

  const { data: banks } = useQuery({
    queryKey: qk.bankAccounts.list(),
    queryFn: () => bankAccountsApi.list().then((r) => r.data as BankAccount[]),
    enabled: open,
  })

  const mutation = useMutation({
    mutationFn: () =>
      assetsApi.dispose(asset.id, {
        date,
        proceeds: proceeds || '0',
        bank_account: Number(proceeds) > 0 ? Number(bankAccount) : null,
      }),
    onSuccess: () => {
      showToast.success(`Asset ${asset.code} disposed`)
      queryClient.invalidateQueries({ queryKey: qk.assets.all })
      queryClient.invalidateQueries({ queryKey: qk.accounts.all })
      queryClient.invalidateQueries({ queryKey: qk.journals.all })
      queryClient.invalidateQueries({ queryKey: qk.bankAccounts.all })
      queryClient.invalidateQueries({ queryKey: qk.reports.all })
      onClose()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to dispose asset')),
  })

  const proceedsNum = Number(proceeds || 0)
  const gainLoss = proceedsNum - Number(asset.net_book_value)

  const submit = () => {
    setFormError('')
    if (!date) { setFormError('Disposal date is required.'); return }
    if (proceedsNum > 0 && !bankAccount) {
      setFormError('A bank account is required when there are disposal proceeds.')
      return
    }
    setConfirming(true)
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title={`Dispose ${asset.code}`} icon={XSquare}
        description="Derecognizes cost and accumulated depreciation; the balance posts to gain/loss on disposal.">
        <div className="space-y-4">
          <Input label="Disposal date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          <Input
            label="Proceeds"
            placeholder="0.00"
            value={proceeds}
            onChange={(e) => setProceeds(e.target.value)}
            hint="Base currency. Leave 0 for a write-off with no sale."
          />
          {proceedsNum > 0 && (
            <Select
              label="Deposit proceeds to"
              required
              placeholder="Select bank account…"
              options={(banks ?? []).filter((b) => b.is_active).map((b) => ({
                value: String(b.id),
                label: `${b.name} (${b.currency})`,
              }))}
              value={bankAccount}
              onChange={(e) => setBankAccount(e.target.value)}
            />
          )}
          <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-gray-500">Net book value</span><span className="tabular-nums">{money(asset.net_book_value)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Proceeds</span><span className="tabular-nums">{money(proceedsNum)}</span></div>
            <div className="flex justify-between font-semibold">
              <span>{gainLoss >= 0 ? 'Gain on disposal' : 'Loss on disposal'}</span>
              <span className={`tabular-nums ${gainLoss >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{money(Math.abs(gainLoss))}</span>
            </div>
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <ModalFooter>
            <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
            <Button variant="danger" type="button" onClick={submit} loading={mutation.isPending}>
              Dispose asset
            </Button>
          </ModalFooter>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => { setConfirming(false); mutation.mutate() }}
        title={`Dispose ${asset.code}?`}
        message="A disposal journal will be posted immediately. This cannot be undone from this screen — a reversal journal would be required."
        confirmText="Dispose asset"
        variant="danger"
      />
    </>
  )
}

export default function AssetDetail() {
  const { id } = useParams()
  const [showDispose, setShowDispose] = useState(false)

  const { data: asset } = useQuery({
    queryKey: qk.assets.detail(id!),
    queryFn: () => assetsApi.get(id!).then((r) => r.data as Asset),
  })

  // Depreciation history: pull entries for this asset out of the run list.
  const { data: runsData, isFetching: runsFetching } = useQuery({
    queryKey: qk.depreciationRuns.list({ forAsset: id }),
    queryFn: () => depreciationRunsApi.list().then((r) => r.data as Paginated<DepreciationRun>),
  })

  // First paint only — the header, stat cards and detail grid stay put while the
  // depreciation history below refetches on its own.
  if (!asset) return <SkeletonCard />

  const historyRefreshing = runsFetching && !!runsData
  const assetId = Number(id)
  const history = (runsData?.results ?? [])
    .filter((run) => run.status !== 'reversed')
    .flatMap((run) =>
      (run.entries ?? [])
        .filter((e) => e.asset === assetId)
        .map((e) => ({ run, entry: e }))
    )
    .sort((a, b) => a.run.run_date.localeCompare(b.run.run_date))

  const canDispose = asset.status === 'active' || asset.status === 'fully_depreciated'
  const method = asset.depreciation_method || ''

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${asset.code} · ${asset.name}`}
        description={asset.description || asset.category_name}
        icon={Bank}
        backLink="/app/fixed-assets"
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status={asset.status} />
            {canDispose && (
              <Button variant="danger" onClick={() => setShowDispose(true)}>
                <XSquare className="w-4 h-4 mr-2" /> Dispose
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatsCard title="Cost (base)" value={money(asset.cost_base)}
          subtitle={`${asset.currency} ${money(asset.cost)} at acquisition`} icon={Bank} color="blue" />
        <StatsCard title="Accumulated depreciation" value={money(asset.accumulated_depreciation)}
          subtitle={`Residual value ${money(asset.residual_value)}`} icon={TrendDown} color="orange" />
        <StatsCard title="Net book value" value={money(asset.net_book_value)}
          subtitle={ASSET_STATUS_LABELS[asset.status] ?? asset.status} icon={Wallet} color="green" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div><span className="text-gray-500 block">Category</span>{asset.category_name}</div>
        <div><span className="text-gray-500 block">Acquired</span>{asset.acquisition_date}</div>
        <div><span className="text-gray-500 block">In service</span>{asset.in_service_date}</div>
        <div>
          <span className="text-gray-500 block">Method</span>
          {method ? (method === 'straight_line' ? 'Straight line' : 'Reducing balance') : 'Category default'}
          {asset.useful_life_months ? ` · ${asset.useful_life_months} months` : ''}
        </div>
        <div><span className="text-gray-500 block">Serial number</span>{asset.serial_number || '—'}</div>
        <div><span className="text-gray-500 block">Location</span>{asset.location || '—'}</div>
        <div><span className="text-gray-500 block">Custodian</span>{asset.custodian || '—'}</div>
        <div>
          <span className="text-gray-500 block">Capitalization journal</span>
          {asset.capitalization_journal ? (
            <Link to={`/app/journals/${asset.capitalization_journal}`}
              className="text-primary-600 dark:text-primary-400 hover:underline font-mono">
              View journal
            </Link>
          ) : '—'}
        </div>
        {asset.status === 'disposed' && (
          <>
            <div><span className="text-gray-500 block">Disposal date</span>{asset.disposal_date}</div>
            <div><span className="text-gray-500 block">Proceeds</span><span className="tabular-nums">{money(asset.disposal_proceeds)}</span></div>
            <div>
              <span className="text-gray-500 block">Disposal journal</span>
              {asset.disposal_journal ? (
                <Link to={`/app/journals/${asset.disposal_journal}`}
                  className="text-primary-600 dark:text-primary-400 hover:underline font-mono">
                  {asset.disposal_journal_number || 'View journal'}
                </Link>
              ) : '—'}
            </div>
          </>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Depreciation history</h2>
        {!runsData ? (
          <SkeletonTable rows={4} />
        ) : history.length === 0 ? (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 py-8 text-center text-gray-400 text-sm">
            No depreciation has been posted for this asset yet.
          </div>
        ) : (
          <div className="relative">
            <RefreshingOverlay active={historyRefreshing} />
            <div className={refreshingContentClass(historyRefreshing, 'overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700')}>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3">Run date</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right">Accumulated after</th>
                  <th className="px-4 py-3 text-right">NBV after</th>
                  <th className="px-4 py-3">Journal</th>
                </tr>
              </thead>
              <tbody>
                {history.map(({ run, entry }) => (
                  <tr key={entry.id} className="border-t border-gray-100 dark:border-gray-700/50">
                    <td className="px-4 py-2.5 font-medium">{run.period_label}</td>
                    <td className="px-4 py-2.5">{run.run_date}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{money(entry.amount)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{money(entry.accumulated_after)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{money(entry.nbv_after)}</td>
                    <td className="px-4 py-2.5">
                      {run.journal ? (
                        <Link to={`/app/journals/${run.journal}`}
                          className="font-mono text-primary-600 dark:text-primary-400 hover:underline">
                          {run.journal_number}
                        </Link>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>

      <DisposeModal asset={asset} open={showDispose} onClose={() => setShowDispose(false)} />
    </div>
  )
}
