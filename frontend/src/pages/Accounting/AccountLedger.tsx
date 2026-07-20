import { useMemo } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowDownRight, ArrowUpRight, BookOpen, Scales } from '@phosphor-icons/react'
import { accountsApi, generalLedgerApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import {
  Badge,
  CurrencyDisplay,
  PageHeader,
  RefreshingOverlay,
  refreshingContentClass,
  SkeletonTable,
  StatsCard,
} from '@/components/ui'
import { sourceDocPath, type Account, type GLEntry, type Paginated } from '@/types/accounting'

export default function AccountLedger() {
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const from = searchParams.get('from') ?? ''
  const to = searchParams.get('to') ?? ''

  const { data: account } = useQuery({
    queryKey: qk.accounts.detail(id!),
    queryFn: () => accountsApi.get(id!).then((r) => r.data as Account),
  })

  const { data: ledger, isFetching: ledgerFetching } = useQuery({
    queryKey: qk.generalLedger.list({ account: id, from, to }),
    queryFn: () =>
      generalLedgerApi
        .list({ account: id, from: from || undefined, to: to || undefined, page_size: 500 })
        .then((r) => r.data as Paginated<GLEntry>),
    enabled: !!id,
    placeholderData: keepPreviousData,
  })
  const isRefreshing = ledgerFetching && !!ledger

  const rows = ledger?.results ?? []
  const totals = useMemo(
    () => ({
      debit: rows.reduce((sum, r) => sum + parseFloat(r.debit_base), 0),
      credit: rows.reduce((sum, r) => sum + parseFloat(r.credit_base), 0),
    }),
    [rows]
  )

  const setRange = (key: 'from' | 'to', value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={account ? `${account.code} · ${account.name}` : 'Account Ledger'}
        description={account ? `${account.account_type} — normal ${account.normal_balance} balance` : ''}
        icon={BookOpen}
        backLink="/app/chart-of-accounts"
        actions={account?.is_system ? <Badge variant="secondary">system account</Badge> : undefined}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatsCard
          icon={Scales}
          title="Current balance (base)"
          value={account ? parseFloat(account.current_balance).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
        />
        <StatsCard icon={ArrowUpRight} title="Period debits" value={totals.debit.toLocaleString(undefined, { minimumFractionDigits: 2 })} />
        <StatsCard icon={ArrowDownRight} title="Period credits" value={totals.credit.toLocaleString(undefined, { minimumFractionDigits: 2 })} />
      </div>

      <div className="flex gap-3 items-end">
        <label className="text-sm text-gray-600 dark:text-gray-300">
          From
          <input type="date" value={from} onChange={(e) => setRange('from', e.target.value)}
            className="block mt-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800" />
        </label>
        <label className="text-sm text-gray-600 dark:text-gray-300">
          To
          <input type="date" value={to} onChange={(e) => setRange('to', e.target.value)}
            className="block mt-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800" />
        </label>
      </div>

      {!ledger ? (
        <SkeletonTable rows={8} />
      ) : (
        <div className="relative overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <RefreshingOverlay active={isRefreshing} />
          <table className={refreshingContentClass(isRefreshing, 'w-full text-sm')}>
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Journal</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3 text-right">Debit</th>
                <th className="px-4 py-3 text-right">Credit</th>
                <th className="px-4 py-3 text-right">Running balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => {
                const docPath = sourceDocPath(entry.source_type, entry.source_id)
                return (
                  <tr key={entry.id} className="border-t border-gray-100 dark:border-gray-700/50">
                    <td className="px-4 py-2.5 whitespace-nowrap">{entry.date}</td>
                    <td className="px-4 py-2.5">
                      <Link to={`/app/journals/${entry.journal_id}`}
                        className="text-primary-600 dark:text-primary-400 hover:underline font-mono">
                        {entry.journal_number}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 max-w-md truncate">{entry.description}</td>
                    <td className="px-4 py-2.5">
                      {docPath ? (
                        <Link to={docPath} className="text-primary-600 dark:text-primary-400 hover:underline">
                          {entry.source_ref || entry.source_type.split('.').pop()}
                        </Link>
                      ) : ('—')}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {parseFloat(entry.debit_amount) !== 0 && (
                        <CurrencyDisplay amount={parseFloat(entry.debit_amount)} currency={entry.currency} />
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {parseFloat(entry.credit_amount) !== 0 && (
                        <CurrencyDisplay amount={parseFloat(entry.credit_amount)} currency={entry.currency} />
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                      <CurrencyDisplay amount={parseFloat(entry.balance)} currency="USD" />
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                    No ledger activity in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
