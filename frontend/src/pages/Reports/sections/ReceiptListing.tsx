import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { DownloadSimple } from '@phosphor-icons/react'
import { bankAccountsApi, reportsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { Button, RefreshingOverlay, SkeletonTable, refreshingContentClass } from '@/components/ui'
import { PAYMENT_METHODS } from '@/types/fees'
import PdfButton from './PdfButton'
import ExcelButton from './ExcelButton'
import type { BankAccount } from '@/types/accounting'

interface ReceiptRow {
  id: number
  number: string
  student_name: string
  method: string
  reference: string
  amount: number | string
}

interface ReceiptGroup {
  bank_account_id: number
  bank_account_name: string
  currency: string
  date: string
  receipts: ReceiptRow[]
  subtotal: number | string
  count: number
}

interface MethodRow {
  method: string
  total: number | string
  count: number
}

interface ReceiptListingData {
  start: string
  end: string
  groups: ReceiptGroup[]
  by_method: MethodRow[]
  total: number | string
  count: number
}

const money = (v: number | string) =>
  Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function firstOfMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function downloadCsv(data: ReceiptListingData) {
  const lines: string[] = []
  const esc = (v: string | number) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  lines.push(['Bank account', 'Currency', 'Date', 'Receipt', 'Student', 'Method', 'Reference', 'Amount'].join(','))
  for (const g of data.groups) {
    for (const r of g.receipts) {
      lines.push([
        esc(g.bank_account_name), esc(g.currency), esc(g.date), esc(r.number),
        esc(r.student_name), esc(r.method), esc(r.reference), money(r.amount),
      ].join(','))
    }
    lines.push(['', '', '', '', '', '', `Subtotal (${g.count})`, money(g.subtotal)].join(','))
  }
  lines.push(['', '', '', '', '', '', `Grand Total (${data.count})`, money(data.total)].join(','))
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `receipt-listing-${data.start}_${data.end}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function ReceiptListing() {
  const [start, setStart] = useState(firstOfMonth())
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10))
  const [bank, setBank] = useState('')
  const [method, setMethod] = useState('')
  const [currency, setCurrency] = useState('')

  const { data: banks } = useQuery({
    queryKey: qk.bankAccounts.list({ page_size: 500 }),
    queryFn: () =>
      bankAccountsApi.list({ page_size: 500 }).then((r) => (r.data.results ?? r.data) as BankAccount[]),
  })
  const activeBanks = (banks ?? []).filter((b) => b.is_active)

  const params: Record<string, string> = { start, end }
  if (bank) params.bank_account = bank
  if (method) params.method = method
  if (currency) params.currency = currency

  const { data, isFetching } = useQuery({
    queryKey: qk.reports.receiptListing(params),
    queryFn: () => reportsApi.receiptListing(params).then((r) => r.data as ReceiptListingData),
    placeholderData: keepPreviousData,
  })
  const isRefreshing = isFetching && !!data

  const inputClass =
    'ml-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-4 flex-wrap text-sm text-gray-600 dark:text-gray-300">
        <label>
          From{' '}
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
        </label>
        <label>
          To{' '}
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
        </label>
        <label>
          Bank account{' '}
          <select value={bank} onChange={(e) => setBank(e.target.value)} className={inputClass}>
            <option value="">All accounts</option>
            {activeBanks.map((b) => (
              <option key={b.id} value={String(b.id)}>{b.name} ({b.currency})</option>
            ))}
          </select>
        </label>
        <label>
          Method{' '}
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputClass}>
            <option value="">All methods</option>
            {PAYMENT_METHODS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          Currency{' '}
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass}>
            <option value="">All</option>
            <option value="USD">USD</option>
            <option value="ZWG">ZWG</option>
          </select>
        </label>
        <div className="ml-auto flex items-center gap-3">
          <Button variant="secondary" size="sm" disabled={!data || data.count === 0} onClick={() => data && downloadCsv(data)}>
            <DownloadSimple className="w-4 h-4 mr-2" /> CSV
          </Button>
          <PdfButton reportKey="receipt-listing" params={params} />
          <ExcelButton reportKey="receipt-listing" params={params} />
        </div>
      </div>

      {!data ? (
        <SkeletonTable rows={10} />
      ) : (
        <div className="relative">
          <RefreshingOverlay active={isRefreshing} />
          <div className={refreshingContentClass(isRefreshing, 'space-y-6')}>
            {data.groups.length === 0 ? (
              <div className="py-16 text-center text-gray-400">No posted receipts in this range.</div>
            ) : (
              <>
                {data.groups.map((group) => (
                  <div
                    key={`${group.bank_account_id}-${group.date}`}
                    className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700"
                  >
                    <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                      <span className="font-semibold text-gray-800 dark:text-gray-100">
                        {group.bank_account_name}{' '}
                        <span className="text-gray-400 font-normal">({group.currency})</span>
                      </span>
                      <span className="text-sm text-gray-500">{group.date}</span>
                    </div>
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                        <tr>
                          <th className="px-4 py-2 w-32">Receipt</th>
                          <th className="px-4 py-2">Student</th>
                          <th className="px-4 py-2 w-36">Method</th>
                          <th className="px-4 py-2">Reference</th>
                          <th className="px-4 py-2 text-right w-36">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.receipts.map((r) => (
                          <tr key={r.id} className="border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/60">
                            <td className="px-4 py-2.5">
                              <Link to={`/app/receipts/${r.id}`} className="font-mono text-primary-600 dark:text-primary-400 hover:underline">
                                {r.number}
                              </Link>
                            </td>
                            <td className="px-4 py-2.5">{r.student_name}</td>
                            <td className="px-4 py-2.5">{r.method}</td>
                            <td className="px-4 py-2.5 text-gray-500 max-w-[12rem] truncate">{r.reference || '—'}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{money(r.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold">
                        <tr>
                          <td className="px-4 py-2.5" colSpan={4}>Subtotal ({group.count})</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{money(group.subtotal)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ))}

                <div className="flex flex-col lg:flex-row gap-6">
                  <div className="lg:w-80 overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                    <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 font-semibold text-gray-800 dark:text-gray-100">
                      Payment method summary
                    </div>
                    <table className="w-full text-sm">
                      <tbody>
                        {data.by_method.map((m) => (
                          <tr key={m.method} className="border-t border-gray-100 dark:border-gray-700/50">
                            <td className="px-4 py-2.5">{m.method}</td>
                            <td className="px-4 py-2.5 text-gray-500 w-24 text-right tabular-nums">{m.count}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{money(m.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex-1 flex items-start justify-end">
                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 px-6 py-4 text-right">
                      <p className="text-xs uppercase text-gray-400">Grand total ({data.count} receipts)</p>
                      <p className="text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{money(data.total)}</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
