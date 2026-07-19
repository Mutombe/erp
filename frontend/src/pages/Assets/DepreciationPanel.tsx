import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Calculator, Play, RotateCcw } from 'lucide-react'
import { depreciationRunsApi, fiscalYearsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { showToast, parseApiError } from '@/lib/toast'
import { Button, ConfirmDialog, SectionHeader, Select, SkeletonTable, StatusBadge } from '@/components/ui'
import type { DepreciationRun, FiscalYear } from '@/types/assets'
import type { Paginated } from '@/types/accounting'

const money = (v: string | number) =>
  Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function DepreciationPanel() {
  const queryClient = useQueryClient()
  const [periodId, setPeriodId] = useState('')
  const [confirmRun, setConfirmRun] = useState(false)
  const [reverseTarget, setReverseTarget] = useState<DepreciationRun | null>(null)

  const { data: runsData, isLoading } = useQuery({
    queryKey: qk.depreciationRuns.list(),
    queryFn: () => depreciationRunsApi.list().then((r) => r.data as Paginated<DepreciationRun>),
  })

  const { data: years } = useQuery({
    queryKey: qk.fiscalYears.list(),
    queryFn: () => fiscalYearsApi.list().then((r) => r.data as FiscalYear[]),
  })

  // Only unlocked periods in open fiscal years can take a depreciation run.
  const periodOptions = (years ?? [])
    .filter((y) => y.status === 'open')
    .flatMap((y) =>
      (y.periods ?? [])
        .filter((p) => !p.is_locked)
        .map((p) => ({
          value: String(p.id),
          label: `${y.name} P${p.period_no} (${p.start_date} → ${p.end_date})`,
        }))
    )

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: qk.depreciationRuns.all })
    queryClient.invalidateQueries({ queryKey: qk.assets.all })
    queryClient.invalidateQueries({ queryKey: qk.accounts.all })
    queryClient.invalidateQueries({ queryKey: qk.journals.all })
    queryClient.invalidateQueries({ queryKey: qk.reports.all })
  }

  const runMutation = useMutation({
    mutationFn: () => depreciationRunsApi.run(Number(periodId)),
    onSuccess: (r) => {
      const run = r.data as DepreciationRun
      showToast.success(`Depreciation posted for ${run.period_label} — ${money(run.total_amount)}`)
      invalidateAll()
      setPeriodId('')
    },
    onError: (error) => showToast.error(parseApiError(error, 'Depreciation run failed')),
  })

  const reverseMutation = useMutation({
    mutationFn: (run: DepreciationRun) => depreciationRunsApi.reverse(run.id, 'Manual reversal'),
    onSuccess: () => {
      showToast.success('Depreciation run reversed')
      invalidateAll()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to reverse run')),
  })

  const runs = runsData?.results ?? []
  const selectedLabel = periodOptions.find((o) => o.value === periodId)?.label

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Depreciation"
        description="Monthly depreciation posts one journal per fiscal period"
        actions={
          <div className="flex items-end gap-2">
            <div className="w-64">
              <Select
                placeholder="Select fiscal period…"
                options={periodOptions}
                value={periodId}
                onChange={(e) => setPeriodId(e.target.value)}
              />
            </div>
            <Button disabled={!periodId} onClick={() => setConfirmRun(true)} loading={runMutation.isPending}>
              <Play className="w-4 h-4 mr-2" /> Run depreciation
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <SkeletonTable rows={4} />
      ) : runs.length === 0 ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 py-10 text-center text-gray-400">
          <Calculator className="w-8 h-8 mx-auto mb-2 opacity-50" />
          No depreciation runs yet. Pick an open fiscal period and run depreciation.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Run date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Total amount</th>
                <th className="px-4 py-3">Journal</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-t border-gray-100 dark:border-gray-700/50">
                  <td className="px-4 py-2.5 font-medium">{run.period_label}</td>
                  <td className="px-4 py-2.5">{run.run_date}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={run.status} /></td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(run.total_amount)}</td>
                  <td className="px-4 py-2.5">
                    {run.journal ? (
                      <Link to={`/app/journals/${run.journal}`}
                        className="font-mono text-primary-600 dark:text-primary-400 hover:underline">
                        {run.journal_number}
                      </Link>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {run.status === 'posted' && (
                      <Button size="sm" variant="secondary" onClick={() => setReverseTarget(run)}>
                        <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Reverse
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={confirmRun}
        onClose={() => setConfirmRun(false)}
        onConfirm={() => { setConfirmRun(false); runMutation.mutate() }}
        title="Run depreciation?"
        message={`Depreciation will be calculated for all active assets and posted as one journal for ${selectedLabel ?? 'the selected period'}.`}
        confirmText="Run depreciation"
        variant="info"
      />

      <ConfirmDialog
        open={!!reverseTarget}
        onClose={() => setReverseTarget(null)}
        onConfirm={() => {
          if (reverseTarget) reverseMutation.mutate(reverseTarget)
          setReverseTarget(null)
        }}
        title={`Reverse depreciation for ${reverseTarget?.period_label ?? ''}?`}
        message="A mirror-image journal will be posted and each asset's accumulated depreciation rolled back. The general ledger is never edited or deleted."
        confirmText="Reverse run"
        variant="danger"
      />
    </div>
  )
}
