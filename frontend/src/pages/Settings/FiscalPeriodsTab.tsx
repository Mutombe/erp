import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, LockOpen } from '@phosphor-icons/react'
import { fiscalPeriodsApi, fiscalYearsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { showToast, parseApiError } from '@/lib/toast'
import { Badge, Button, Card, ConfirmDialog, SkeletonTable, StatusBadge } from '@/components/ui'
import type { FiscalPeriod, FiscalYear } from '@/types/assets'

export default function FiscalPeriodsTab() {
  const queryClient = useQueryClient()
  const [target, setTarget] = useState<{ period: FiscalPeriod; year: FiscalYear; action: 'lock' | 'unlock' } | null>(null)

  const { data: years, isLoading } = useQuery({
    queryKey: qk.fiscalYears.list(),
    queryFn: () => fiscalYearsApi.list().then((r) => r.data as FiscalYear[]),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: qk.fiscalYears.all })
    queryClient.invalidateQueries({ queryKey: qk.fiscalPeriods.all })
  }

  const lockMutation = useMutation({
    mutationFn: ({ period, action }: { period: FiscalPeriod; action: 'lock' | 'unlock' }) =>
      action === 'lock'
        ? fiscalPeriodsApi.lock(period.id)
        : fiscalPeriodsApi.update(period.id, { is_locked: false }),
    onSuccess: (_, { action }) => {
      showToast.success(action === 'lock' ? 'Period locked' : 'Period unlocked')
      invalidate()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to update period')),
  })

  if (isLoading || !years) return <SkeletonTable rows={8} />

  if (years.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 py-12 text-center text-gray-400">
        No fiscal years configured. Fiscal years and periods are usually seeded by the backend setup.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {years.map((year) => (
        <Card key={year.id} padding="md">
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{year.name}</h3>
            <span className="text-sm text-gray-500">{year.start_date} → {year.end_date}</span>
            <StatusBadge status={year.status} />
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-100 dark:border-gray-700/50">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-2.5 w-20">Period</th>
                  <th className="px-4 py-2.5">Start</th>
                  <th className="px-4 py-2.5">End</th>
                  <th className="px-4 py-2.5 w-28">Status</th>
                  <th className="px-4 py-2.5 text-right w-32" />
                </tr>
              </thead>
              <tbody>
                {(year.periods ?? []).map((period) => (
                  <tr key={period.id} className="border-t border-gray-100 dark:border-gray-700/50">
                    <td className="px-4 py-2.5 font-mono">P{period.period_no}</td>
                    <td className="px-4 py-2.5">{period.start_date}</td>
                    <td className="px-4 py-2.5">{period.end_date}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={period.is_locked ? 'purple' : 'success'} dot>
                        {period.is_locked ? 'Locked' : 'Open'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {period.is_locked ? (
                        <Button size="sm" variant="ghost"
                          onClick={() => setTarget({ period, year, action: 'unlock' })}>
                          <LockOpen className="w-3.5 h-3.5 mr-1.5" /> Unlock
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline"
                          onClick={() => setTarget({ period, year, action: 'lock' })}>
                          <Lock className="w-3.5 h-3.5 mr-1.5" /> Lock
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}

      <ConfirmDialog
        open={!!target}
        onClose={() => setTarget(null)}
        onConfirm={() => {
          if (target) lockMutation.mutate({ period: target.period, action: target.action })
          setTarget(null)
        }}
        title={
          target
            ? `${target.action === 'lock' ? 'Lock' : 'Unlock'} ${target.year.name} P${target.period.period_no}?`
            : ''
        }
        message={
          target?.action === 'lock'
            ? 'No journal can post into a locked period. Depreciation, invoices and receipts dated inside it will be rejected.'
            : 'Posting into this period will be allowed again. Unlock only to fix genuine errors.'
        }
        confirmText={target?.action === 'lock' ? 'Lock period' : 'Unlock period'}
        variant={target?.action === 'lock' ? 'warning' : 'info'}
      />
    </div>
  )
}
