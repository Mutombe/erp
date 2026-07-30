import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { CheckCircle, Receipt } from '@phosphor-icons/react'
import { creditNotesApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { showToast, parseApiError } from '@/lib/toast'
import RecordLink from '@/components/RecordLink'
import {
  Button,
  CurrencyDisplay,
  PageHeader,
  RefreshingOverlay,
  SkeletonCard,
  StatusBadge,
  refreshingContentClass,
} from '@/components/ui'
import { fmtMoney, type CreditNote } from '@/types/fees'

export default function CreditNoteDetail() {
  const { id } = useParams()
  const queryClient = useQueryClient()

  const { data: note, isFetching } = useQuery({
    queryKey: qk.creditNotes.detail(id!),
    queryFn: () => creditNotesApi.get(id!).then((r) => r.data as CreditNote),
  })

  const postMutation = useMutation({
    mutationFn: () => creditNotesApi.post(id!),
    onSuccess: () => {
      showToast.success('Credit note posted')
      queryClient.invalidateQueries({ queryKey: qk.creditNotes.all })
      queryClient.invalidateQueries({ queryKey: qk.feeInvoices.all })
      queryClient.invalidateQueries({ queryKey: qk.journals.all })
      queryClient.invalidateQueries({ queryKey: qk.students.all })
      queryClient.invalidateQueries({ queryKey: qk.reports.all })
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to post credit note')),
  })

  if (!note) return <SkeletonCard />

  const isRefreshing = isFetching && !!note

  return (
    <div className="space-y-6">
      <PageHeader
        title={note.number}
        description={`${note.student_name} · ${note.currency} ${fmtMoney(note.total)}`}
        icon={Receipt}
        backLink="/app/credit-notes"
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status={note.status} />
            {note.status === 'draft' && (
              <Button onClick={() => postMutation.mutate()} loading={postMutation.isPending}>
                <CheckCircle className="w-4 h-4 mr-2" /> Post
              </Button>
            )}
          </div>
        }
      />

      <div className="relative">
        <RefreshingOverlay active={isRefreshing} />
        <div className={refreshingContentClass(isRefreshing, 'grid grid-cols-2 md:grid-cols-4 gap-4 text-sm')}>
          <div>
            <span className="text-gray-500 block">Student</span>
            <RecordLink to={`/app/students/${note.student}`}>
              <span className="font-mono">{note.student_code}</span> {note.student_name}
            </RecordLink>
          </div>
          <div>
            <span className="text-gray-500 block">Invoice</span>
            {note.invoice ? (
              <RecordLink to={`/app/fee-invoices/${note.invoice}`} mono>
                {note.invoice_number ?? `#${note.invoice}`}
              </RecordLink>
            ) : (
              '—'
            )}
          </div>
          <div><span className="text-gray-500 block">Date</span>{note.date}</div>
          <div><span className="text-gray-500 block">Currency</span>{note.currency}</div>
          <div>
            <span className="text-gray-500 block">Journal</span>
            {note.journal ? (
              <RecordLink to={`/app/journals/${note.journal}`} mono>
                {note.journal_number ?? `#${note.journal}`}
              </RecordLink>
            ) : (
              '—'
            )}
          </div>
          {note.reason && (
            <div className="col-span-2 md:col-span-3">
              <span className="text-gray-500 block">Reason</span>
              {note.reason}
            </div>
          )}
        </div>
      </div>

      <div className="relative">
        <RefreshingOverlay active={isRefreshing} />
        <div className={refreshingContentClass(isRefreshing, 'overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700')}>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {note.lines.map((line) => (
                <tr key={line.id} className="border-t border-gray-100 dark:border-gray-700/50">
                  <td className="px-4 py-2.5 font-mono">{line.fee_category_code}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(line.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold">
              <tr>
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <CurrencyDisplay amount={Number(note.total)} currency={note.currency} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
