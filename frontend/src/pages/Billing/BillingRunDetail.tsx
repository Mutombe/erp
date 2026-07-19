import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { Eye, PlayCircle, Zap } from 'lucide-react'
import { billingRunsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { showToast, parseApiError } from '@/lib/toast'
import {
  Badge,
  Button,
  ConfirmDialog,
  PageHeader,
  SkeletonCard,
  StatusBadge,
} from '@/components/ui'
import { fmtMoney, type BillingPreview, type BillingRun } from '@/types/fees'

export default function BillingRunDetail() {
  const { id } = useParams()
  const queryClient = useQueryClient()
  const [preview, setPreview] = useState<BillingPreview | null>(null)
  const [confirmExecute, setConfirmExecute] = useState(false)

  const { data: run, isLoading, refetch } = useQuery({
    queryKey: qk.billingRuns.detail(id!),
    queryFn: () => billingRunsApi.get(id!).then((r) => r.data as BillingRun),
  })

  const previewMutation = useMutation({
    mutationFn: () => billingRunsApi.preview(id!),
    onSuccess: (r) => {
      setPreview(r.data as BillingPreview)
      queryClient.invalidateQueries({ queryKey: qk.billingRuns.all })
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to preview billing run')),
  })

  const executeMutation = useMutation({
    mutationFn: () =>
      showToast.promise(billingRunsApi.execute(id!), {
        loading: 'Executing billing run — generating and posting invoices…',
        success: 'Billing run completed',
        error: 'Billing run failed',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.billingRuns.all })
      queryClient.invalidateQueries({ queryKey: qk.feeInvoices.all })
      queryClient.invalidateQueries({ queryKey: qk.journals.all })
      queryClient.invalidateQueries({ queryKey: qk.students.all })
      queryClient.invalidateQueries({ queryKey: qk.reports.all })
      refetch()
    },
    onError: () => refetch(),
  })

  if (isLoading || !run) return <SkeletonCard />

  const canAct = ['draft', 'previewed', 'failed'].includes(run.status)

  return (
    <div className="space-y-6">
      <PageHeader
        title={run.number}
        description={`${run.term_name} · ${run.currency}`}
        icon={PlayCircle}
        backLink="/app/billing-runs"
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status={run.status} />
            {canAct && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => previewMutation.mutate()}
                  loading={previewMutation.isPending}
                >
                  <Eye className="w-4 h-4 mr-2" /> Preview
                </Button>
                <Button onClick={() => setConfirmExecute(true)} loading={executeMutation.isPending}>
                  <Zap className="w-4 h-4 mr-2" /> Execute
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div><span className="text-gray-500 block">Term</span>{run.term_name}</div>
        <div><span className="text-gray-500 block">Currency</span>{run.currency}</div>
        <div><span className="text-gray-500 block">Invoice date</span>{run.date}</div>
        <div><span className="text-gray-500 block">Due date</span>{run.due_date || '—'}</div>
        <div><span className="text-gray-500 block">Invoices created</span><span className="tabular-nums">{run.invoices_created}</span></div>
        <div><span className="text-gray-500 block">Total billed</span><span className="tabular-nums">{run.currency} {fmtMoney(run.total_billed)}</span></div>
        {run.status === 'completed' && (
          <div className="col-span-2">
            <span className="text-gray-500 block">Generated invoices</span>
            <Link
              to={`/app/fee-invoices?billing_run=${run.id}`}
              className="text-primary-600 dark:text-primary-400 hover:underline"
            >
              View generated invoices →
            </Link>
          </div>
        )}
      </div>

      {run.status === 'failed' && run.error_message && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300">
          <span className="font-semibold block mb-1">Run failed</span>
          {run.error_message}
        </div>
      )}

      {preview && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Preview</h3>
            <p className="text-sm text-gray-500">
              <span className="tabular-nums font-medium">{preview.count}</span> student(s) to bill ·
              total <span className="tabular-nums font-medium">{run.currency} {fmtMoney(preview.total_to_bill)}</span>
            </p>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Grade</th>
                  <th className="px-4 py-3">Lines</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.student_id} className="border-t border-gray-100 dark:border-gray-700/50">
                    <td className="px-4 py-2.5">
                      <Link
                        to={`/app/students/${row.student_id}`}
                        className="font-mono text-primary-600 dark:text-primary-400 hover:underline"
                      >
                        {row.student_code}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">{row.student_name}</td>
                    <td className="px-4 py-2.5">{row.grade}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">
                      {row.lines
                        .map(
                          (l) =>
                            `${l.fee_category} ${fmtMoney(l.amount)}${Number(l.discount) > 0 ? ` − ${fmtMoney(l.discount)}` : ''}`
                        )
                        .join(', ')}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(row.total)}</td>
                    <td className="px-4 py-2.5">
                      {row.already_billed ? (
                        <Badge variant="warning">Already billed</Badge>
                      ) : (
                        <Badge variant="success">Will bill</Badge>
                      )}
                    </td>
                  </tr>
                ))}
                {preview.rows.length === 0 && (
                  <tr className="border-t border-gray-100 dark:border-gray-700/50">
                    <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                      No matching students — check that fee structures exist for this term and currency.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmExecute}
        onClose={() => setConfirmExecute(false)}
        onConfirm={() => {
          setConfirmExecute(false)
          executeMutation.mutate()
        }}
        title={`Execute ${run.number}?`}
        message="Fee invoices will be generated and posted to the general ledger for every eligible student. Students already billed for this term and currency are skipped."
        confirmText="Execute run"
        variant="warning"
      />
    </div>
  )
}
