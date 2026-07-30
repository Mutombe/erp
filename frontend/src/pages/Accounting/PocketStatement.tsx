import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Coins } from '@phosphor-icons/react'
import { subAccountsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import {
  Badge,
  PageHeader,
  RefreshingOverlay,
  SkeletonTable,
  refreshingContentClass,
} from '@/components/ui'

interface SubAccount {
  id: number
  code: string
  name: string
  party_type: 'student' | 'supplier'
  student: number | null
  student_name: string | null
  supplier: number | null
  supplier_name: string | null
  category: string
  currency: string
  current_balance: number | string
  is_active: boolean
}

interface Txn {
  id: number
  date: string
  contra_account: string
  reference: string
  description: string
  debit: number | string
  credit: number | string
  balance: number | string
  journal_id: number | null
}

const money = (v: number | string) =>
  Number(v) ? Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''

const bal = (v: number | string) =>
  Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const dateInputClass =
  'ml-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'

export default function PocketStatement() {
  const { id = '' } = useParams()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const { data: sub } = useQuery({
    queryKey: qk.subAccounts.detail(id),
    queryFn: () => subAccountsApi.get(id).then((r) => r.data as SubAccount),
  })

  const { data: rows, isFetching } = useQuery({
    queryKey: qk.subAccounts.transactions(id, { from, to }),
    queryFn: () =>
      subAccountsApi
        .transactions(id, { ...(from ? { from } : {}), ...(to ? { to } : {}) })
        .then((r) => r.data as Txn[]),
    placeholderData: keepPreviousData,
  })

  const isRefreshing = isFetching && !!rows

  // Debit-normal for students (they owe the school), credit-normal for suppliers.
  const normalDebit = sub?.party_type === 'student'
  const signed = (t: Txn) => {
    const d = Number(t.debit)
    const c = Number(t.credit)
    return normalDebit ? d - c : c - d
  }
  const opening = rows && rows.length > 0 ? Number(rows[0].balance) - signed(rows[0]) : 0
  const closing = rows && rows.length > 0 ? Number(rows[rows.length - 1].balance) : opening

  const partyLink =
    sub?.party_type === 'student' && sub.student
      ? `/app/students/${sub.student}`
      : sub?.party_type === 'supplier' && sub.supplier
        ? `/app/suppliers/${sub.supplier}`
        : null

  return (
    <div className="space-y-6">
      <div>
        <Link to="/app/pockets" className="inline-flex items-center gap-1.5 text-sm text-primary-600 dark:text-primary-400 hover:underline mb-3">
          <ArrowLeft className="w-4 h-4" /> All pockets
        </Link>
        <PageHeader
          title={sub ? sub.name : 'Pocket statement'}
          description={
            sub
              ? `${sub.code} · ${sub.category} · ${sub.currency} · running-balance sub-ledger`
              : 'Running-balance sub-ledger'
          }
          icon={Coins}
          actions={
            sub && (
              <div className="flex items-center gap-2">
                <Badge variant={sub.party_type === 'student' ? 'info' : 'default'}>
                  {sub.party_type === 'student' ? 'Student' : 'Supplier'}
                </Badge>
                {partyLink && (
                  <Link to={partyLink} className="text-sm text-primary-600 dark:text-primary-400 hover:underline">
                    Open {sub.party_type}
                  </Link>
                )}
              </div>
            )
          }
        />
      </div>

      <div className="flex items-center flex-wrap gap-3">
        <label className="text-sm text-gray-600 dark:text-gray-300">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={dateInputClass} />
        </label>
        <label className="text-sm text-gray-600 dark:text-gray-300">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={dateInputClass} />
        </label>
        {(from || to) && (
          <button
            onClick={() => {
              setFrom('')
              setTo('')
            }}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 underline"
          >
            Clear
          </button>
        )}
      </div>

      {!rows ? (
        <SkeletonTable rows={10} />
      ) : (
        <div className="relative overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <RefreshingOverlay active={isRefreshing} />
          <table className={refreshingContentClass(isRefreshing, 'w-full text-sm')}>
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3 w-28">Date</th>
                <th className="px-4 py-3 w-32">Reference</th>
                <th className="px-4 py-3 w-24">Contra</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right w-32">Debit</th>
                <th className="px-4 py-3 text-right w-32">Credit</th>
                <th className="px-4 py-3 text-right w-36">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-gray-100 dark:border-gray-700/50 bg-gray-50/60 dark:bg-gray-800/40">
                <td className="px-4 py-2.5">{from || '—'}</td>
                <td className="px-4 py-2.5 font-medium text-gray-600 dark:text-gray-300" colSpan={3}>
                  Opening balance
                </td>
                <td className="px-4 py-2.5" />
                <td className="px-4 py-2.5" />
                <td className="px-4 py-2.5 text-right tabular-nums font-medium">{bal(opening)}</td>
              </tr>
              {rows.map((t) => (
                <tr key={t.id} className="border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/60">
                  <td className="px-4 py-2.5">{t.date}</td>
                  <td className="px-4 py-2.5">
                    {t.journal_id ? (
                      <Link to={`/app/journals/${t.journal_id}`} className="font-mono text-primary-600 dark:text-primary-400 hover:underline">
                        {t.reference || `#${t.journal_id}`}
                      </Link>
                    ) : (
                      <span className="font-mono text-gray-500">{t.reference || '—'}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{t.contra_account || '—'}</td>
                  <td className="px-4 py-2.5 max-w-md truncate">{t.description || '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{money(t.debit)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-red-600 dark:text-red-400">{money(t.credit)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{bal(t.balance)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                    No movements in this range.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold">
              <tr>
                <td className="px-4 py-3" colSpan={4}>
                  Closing balance{to ? ` (${to})` : ''}
                </td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-right tabular-nums">
                  {sub?.currency} {bal(closing)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
