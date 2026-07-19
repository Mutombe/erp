import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { bankAccountsApi, reportsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { SkeletonTable } from '@/components/ui'
import PdfButton from './PdfButton'
import type { BankAccount } from '@/types/accounting'

interface CashbookRow {
  date: string
  journal_id: number
  journal_number: string
  description: string
  reference: string
  received: number | string
  paid: number | string
  balance: number | string
  source_type: string
  source_id: number | null
}

interface CashbookData {
  bank_account: { id: number; name: string; currency: string }
  start: string
  end: string
  opening_balance: number | string
  rows: CashbookRow[]
  closing_balance: number | string
}

const money = (v: number | string) =>
  Number(v) ? Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''

const balance = (v: number | string) =>
  Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function firstOfMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export default function Cashbook() {
  const [bank, setBank] = useState('')
  const [start, setStart] = useState(firstOfMonth())
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10))

  const { data: banks } = useQuery({
    queryKey: qk.bankAccounts.list(),
    queryFn: () => bankAccountsApi.list().then((r) => r.data as BankAccount[]),
  })

  // Default to the default (or first) active bank account once loaded.
  const activeBanks = (banks ?? []).filter((b) => b.is_active)
  const effectiveBank =
    bank || String(activeBanks.find((b) => b.is_default)?.id ?? activeBanks[0]?.id ?? '')

  const { data, isLoading } = useQuery({
    queryKey: qk.reports.cashbook({ bank: effectiveBank, start, end }),
    queryFn: () =>
      reportsApi
        .cashbook({ bank_account: effectiveBank, start, end })
        .then((r) => r.data as CashbookData),
    enabled: !!effectiveBank,
  })

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-4 flex-wrap text-sm text-gray-600 dark:text-gray-300">
        <label>
          Bank account{' '}
          <select
            value={effectiveBank}
            onChange={(e) => setBank(e.target.value)}
            className="ml-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
          >
            {activeBanks.map((b) => (
              <option key={b.id} value={String(b.id)}>{b.name} ({b.currency})</option>
            ))}
          </select>
        </label>
        <label>
          From{' '}
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
            className="ml-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800" />
        </label>
        <label>
          To{' '}
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
            className="ml-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800" />
        </label>
        <div className="ml-auto">
          <PdfButton
            reportKey="cashbook"
            params={{ bank_account: effectiveBank, start, end }}
            disabled={!effectiveBank}
          />
        </div>
      </div>

      {!effectiveBank ? (
        <div className="py-16 text-center text-gray-400">No active bank accounts to report on.</div>
      ) : isLoading || !data ? (
        <SkeletonTable rows={10} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3 w-28">Date</th>
                <th className="px-4 py-3 w-32">Journal</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3 text-right">Received</th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th className="px-4 py-3 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-gray-100 dark:border-gray-700/50 bg-gray-50/60 dark:bg-gray-800/40">
                <td className="px-4 py-2.5">{data.start}</td>
                <td className="px-4 py-2.5" colSpan={3}>
                  <span className="font-medium text-gray-600 dark:text-gray-300">Opening balance</span>
                </td>
                <td className="px-4 py-2.5" />
                <td className="px-4 py-2.5" />
                <td className="px-4 py-2.5 text-right tabular-nums font-medium">{balance(data.opening_balance)}</td>
              </tr>
              {data.rows.map((row, i) => (
                <tr key={`${row.journal_id}-${i}`} className="border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/60">
                  <td className="px-4 py-2.5">{row.date}</td>
                  <td className="px-4 py-2.5">
                    <Link to={`/app/journals/${row.journal_id}`}
                      className="font-mono text-primary-600 dark:text-primary-400 hover:underline">
                      {row.journal_number}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 max-w-sm truncate">{row.description}</td>
                  <td className="px-4 py-2.5 max-w-[10rem] truncate text-gray-500">{row.reference || '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{money(row.received)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-red-600 dark:text-red-400">{money(row.paid)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{balance(row.balance)}</td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No movements in this range.</td></tr>
              )}
            </tbody>
            <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold">
              <tr>
                <td className="px-4 py-3" colSpan={4}>Closing balance ({data.end})</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {money(data.rows.reduce((sum, r) => sum + Number(r.received), 0))}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {money(data.rows.reduce((sum, r) => sum + Number(r.paid), 0))}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{balance(data.closing_balance)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
