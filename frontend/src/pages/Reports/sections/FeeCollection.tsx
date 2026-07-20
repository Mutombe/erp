import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { reportsApi, termsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { RefreshingOverlay, SkeletonTable, refreshingContentClass } from '@/components/ui'
import PdfButton from './PdfButton'

interface Term {
  id: number
  academic_year: number
  number: number
  name: string
  start_date: string
  end_date: string
  is_current: boolean
}

interface FCRow {
  category: string
  category_name: string
  billed: number | string
  collected: number | string
  outstanding: number | string
  collection_rate: number
}

interface FCData {
  term: string | null
  rows: FCRow[]
  total_billed: number | string
  total_collected: number | string
}

const money = (v: number | string) =>
  Number(v) ? Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''

export default function FeeCollection() {
  const [term, setTerm] = useState('')

  const { data: terms } = useQuery({
    queryKey: qk.terms.list(),
    queryFn: () => termsApi.list().then((r) => r.data as Term[]),
  })

  // Default to the current term once terms load; '' with no current term = all terms.
  const effectiveTerm = term || String((terms ?? []).find((t) => t.is_current)?.id ?? '')

  const { data, isFetching } = useQuery({
    queryKey: qk.reports.feeCollection({ term: effectiveTerm }),
    queryFn: () =>
      reportsApi
        .feeCollection(effectiveTerm ? { term: effectiveTerm } : undefined)
        .then((r) => r.data as FCData),
    placeholderData: keepPreviousData,
  })

  // Switching term keeps the previous collection figures on screen.
  const isRefreshing = isFetching && !!data

  const totalOutstanding = (data?.rows ?? []).reduce((sum, r) => sum + Number(r.outstanding), 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <label className="text-sm text-gray-600 dark:text-gray-300">
          Term{' '}
          <select
            value={effectiveTerm}
            onChange={(e) => setTerm(e.target.value)}
            className="ml-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
          >
            <option value="">All terms</option>
            {(terms ?? []).map((t) => (
              <option key={t.id} value={String(t.id)}>
                {t.name}{t.is_current ? ' (current)' : ''}
              </option>
            ))}
          </select>
        </label>
        <PdfButton
          reportKey="fee-collection"
          params={effectiveTerm ? { term: effectiveTerm } : undefined}
        />
      </div>

      {!data ? (
        <SkeletonTable rows={6} />
      ) : (
        <div className="relative overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <RefreshingOverlay active={isRefreshing} />
          <table className={refreshingContentClass(isRefreshing, 'w-full text-sm')}>
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Fee category</th>
                <th className="px-4 py-3 text-right">Billed</th>
                <th className="px-4 py-3 text-right">Collected</th>
                <th className="px-4 py-3 text-right">Outstanding</th>
                <th className="px-4 py-3 w-52">Collection rate</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => {
                const rate = Math.max(0, Math.min(100, row.collection_rate))
                return (
                  <tr key={row.category} className="border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/60">
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs mr-2 text-gray-400">{row.category}</span>
                      {row.category_name}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{money(row.billed)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{money(row.collected)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${Number(row.outstanding) > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
                      {money(row.outstanding)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary-500"
                            style={{ width: `${rate}%` }}
                          />
                        </div>
                        <span className="tabular-nums text-xs text-gray-500 dark:text-gray-400 w-12 text-right">
                          {row.collection_rate.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {data.rows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">No billing for this term yet.</td></tr>
              )}
            </tbody>
            <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold">
              <tr>
                <td className="px-4 py-3">Totals</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(data.total_billed)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(data.total_collected)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(totalOutstanding)}</td>
                <td className="px-4 py-3 tabular-nums text-xs text-gray-500 dark:text-gray-400">
                  {Number(data.total_billed) > 0
                    ? `${((Number(data.total_collected) / Number(data.total_billed)) * 100).toFixed(1)}% overall`
                    : ''}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
