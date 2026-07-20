import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CheckCircle, ArrowCounterClockwise, Scroll } from '@phosphor-icons/react'
import { useState } from 'react'
import { journalsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { showToast, parseApiError } from '@/lib/toast'
import {
  Button,
  ConfirmDialog,
  CurrencyDisplay,
  PageHeader,
  RefreshingOverlay,
  refreshingContentClass,
  SkeletonCard,
  StatusBadge,
} from '@/components/ui'
import { sourceDocPath, type Journal } from '@/types/accounting'

export default function JournalDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmReverse, setConfirmReverse] = useState(false)

  const { data: journal, isFetching } = useQuery({
    queryKey: qk.journals.detail(id!),
    queryFn: () => journalsApi.get(id!).then((r) => r.data as Journal),
  })
  const isRefreshing = isFetching && !!journal

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: qk.journals.all })
    queryClient.invalidateQueries({ queryKey: qk.generalLedger.all })
    queryClient.invalidateQueries({ queryKey: qk.accounts.all })
    queryClient.invalidateQueries({ queryKey: qk.reports.all })
  }

  const postMutation = useMutation({
    mutationFn: () => journalsApi.post(id!),
    onSuccess: () => { showToast.success('Journal posted'); invalidateAll() },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to post journal')),
  })

  const reverseMutation = useMutation({
    mutationFn: (reason: string) => journalsApi.reverse(id!, reason),
    onSuccess: (r) => {
      showToast.success(`Reversed by ${r.data.number}`)
      invalidateAll()
      navigate(`/app/journals/${r.data.id}`)
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to reverse journal')),
  })

  if (!journal) return <SkeletonCard />

  const docPath = sourceDocPath(journal.source_type, journal.source_id)

  return (
    <div className="space-y-6">
      <PageHeader
        title={journal.number}
        description={journal.description}
        icon={Scroll}
        backLink="/app/journals"
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status={journal.status} />
            {journal.status === 'draft' && (
              <Button onClick={() => postMutation.mutate()} loading={postMutation.isPending}>
                <CheckCircle className="w-4 h-4 mr-2" /> Post
              </Button>
            )}
            {journal.status === 'posted' && (
              <Button variant="secondary" onClick={() => setConfirmReverse(true)}>
                <ArrowCounterClockwise className="w-4 h-4 mr-2" /> Reverse
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div><span className="text-gray-500 block">Date</span>{journal.date}</div>
        <div><span className="text-gray-500 block">Type</span>{journal.journal_type}</div>
        <div><span className="text-gray-500 block">Currency</span>{journal.currency} @ {parseFloat(journal.exchange_rate)}</div>
        <div>
          <span className="text-gray-500 block">Source document</span>
          {docPath ? (
            <Link to={docPath} className="text-primary-600 dark:text-primary-400 hover:underline">
              {journal.source_ref || journal.source_type}
            </Link>
          ) : (journal.reference || '—')}
        </div>
        {journal.reversed_by_number && (
          <div className="col-span-2">
            <span className="text-gray-500 block">Reversed by</span>
            <Link to={`/app/journals/${journal.reversed_by}`} className="text-primary-600 hover:underline font-mono">
              {journal.reversed_by_number}
            </Link>
            {journal.reversal_reason && <span className="text-gray-500 ml-2">({journal.reversal_reason})</span>}
          </div>
        )}
        {journal.posted_by_email && (
          <div><span className="text-gray-500 block">Posted by</span>{journal.posted_by_email}</div>
        )}
      </div>

      <div className="relative overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
        <RefreshingOverlay active={isRefreshing} />
        <table className={refreshingContentClass(isRefreshing, 'w-full text-sm')}>
          <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
            <tr>
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Sub-account</th>
              <th className="px-4 py-3 text-right">Debit</th>
              <th className="px-4 py-3 text-right">Credit</th>
            </tr>
          </thead>
          <tbody>
            {journal.lines.map((line) => (
              <tr key={line.id} className="border-t border-gray-100 dark:border-gray-700/50">
                <td className="px-4 py-2.5">
                  <Link to={`/app/accounts/${line.account}`}
                    className="text-primary-600 dark:text-primary-400 hover:underline">
                    <span className="font-mono">{line.account_code}</span> {line.account_name}
                  </Link>
                </td>
                <td className="px-4 py-2.5 max-w-sm truncate">{line.description}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{line.sub_account_code || '—'}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {parseFloat(line.debit_amount) !== 0 && (
                    <CurrencyDisplay amount={parseFloat(line.debit_amount)} currency={journal.currency} />
                  )}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {parseFloat(line.credit_amount) !== 0 && (
                    <CurrencyDisplay amount={parseFloat(line.credit_amount)} currency={journal.currency} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold">
            <tr>
              <td className="px-4 py-3" colSpan={3}>Totals</td>
              <td className="px-4 py-3 text-right tabular-nums">
                <CurrencyDisplay amount={parseFloat(journal.total_debit)} currency={journal.currency} />
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                <CurrencyDisplay amount={parseFloat(journal.total_credit)} currency={journal.currency} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <ConfirmDialog
        open={confirmReverse}
        onClose={() => setConfirmReverse(false)}
        onConfirm={() => { setConfirmReverse(false); reverseMutation.mutate('Manual reversal') }}
        title={`Reverse ${journal.number}?`}
        message="A mirror-image journal will be posted. The general ledger is never edited or deleted."
        confirmText="Reverse journal"
        variant="danger"
      />
    </div>
  )
}
