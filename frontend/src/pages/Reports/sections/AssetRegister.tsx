import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { DownloadSimple } from '@phosphor-icons/react'
import { reportsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { exportToCSV, formatExportNumber } from '@/lib/export'
import { Button, SkeletonTable, StatusBadge } from '@/components/ui'
import PdfButton from './PdfButton'
import type { AssetRegisterData } from '@/types/assets'

type Num = number | string

type RegisterRow = AssetRegisterData['rows'][number] & {
  addition_in_period?: Num
  disposal_in_period?: Num
  period_depreciation?: Num
}

interface RegisterData extends Omit<AssetRegisterData, 'rows'> {
  rows: RegisterRow[]
  start?: string
  end?: string
  movement_totals?: {
    opening_cost: Num
    additions: Num
    disposals: Num
    closing_cost: Num
    period_charge: Num
    accumulated: Num
    nbv: Num
  }
}

const money = (v: Num | undefined) =>
  Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function AssetRegister() {
  const today = new Date().toISOString().slice(0, 10)
  const [start, setStart] = useState(`${new Date().getFullYear()}-01-01`)
  const [end, setEnd] = useState(today)

  const { data, isLoading } = useQuery({
    queryKey: qk.reports.assetRegister({ start, end }),
    queryFn: () => reportsApi.assetRegister({ start, end }).then((r) => r.data as RegisterData),
  })

  const handleExport = () =>
    data &&
    exportToCSV(
      data.rows,
      [
        { key: 'code', header: 'Code' },
        { key: 'name', header: 'Asset' },
        { key: 'category', header: 'Category' },
        { key: 'acquisition_date', header: 'Acquired' },
        { key: 'status', header: 'Status' },
        { key: 'cost', header: 'Cost', format: formatExportNumber },
        { key: 'addition_in_period', header: 'Additions', format: formatExportNumber },
        { key: 'disposal_in_period', header: 'Disposals', format: formatExportNumber },
        { key: 'period_depreciation', header: 'Period Depreciation', format: formatExportNumber },
        { key: 'accumulated_depreciation', header: 'Accum. Depr.', format: formatExportNumber },
        { key: 'net_book_value', header: 'NBV', format: formatExportNumber },
      ],
      `asset-register-${start}-to-${end}`
    )

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <SkeletonTable rows={10} />
      </div>
    )
  }

  // Group rows by category, preserving backend (code) order.
  const categories: { name: string; rows: RegisterRow[] }[] = []
  for (const row of data.rows) {
    const existing = categories.find((c) => c.name === row.category)
    if (existing) existing.rows.push(row)
    else categories.push({ name: row.category, rows: [row] })
  }

  const mv = data.movement_totals

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center flex-wrap gap-3">
          <label className="text-sm text-gray-600 dark:text-gray-300">
            From{' '}
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
              className="ml-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800" />
          </label>
          <label className="text-sm text-gray-600 dark:text-gray-300">
            To{' '}
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
              className="ml-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800" />
          </label>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" disabled={data.rows.length === 0} onClick={handleExport}>
            <DownloadSimple className="w-4 h-4 mr-2" /> Export CSV
          </Button>
          <PdfButton reportKey="asset-register" params={{ start, end }} />
        </div>
      </div>

      {mv && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-600 dark:text-gray-300 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-4 py-2.5">
          <span>Opening cost <span className="font-semibold tabular-nums">{money(mv.opening_cost)}</span></span>
          <span className="text-gray-400">+</span>
          <span>Additions <span className="font-semibold tabular-nums">{money(mv.additions)}</span></span>
          <span className="text-gray-400">&minus;</span>
          <span>Disposals <span className="font-semibold tabular-nums">{money(mv.disposals)}</span></span>
          <span className="text-gray-400">=</span>
          <span>Closing cost <span className="font-semibold tabular-nums">{money(mv.closing_cost)}</span></span>
          <span className="text-gray-300 dark:text-gray-600 mx-1">|</span>
          <span>Period charge <span className="font-semibold tabular-nums">{money(mv.period_charge)}</span></span>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
          <tr>
            <th className="px-4 py-3 w-28">Code</th>
            <th className="px-4 py-3">Asset</th>
            <th className="px-4 py-3 w-28">Acquired</th>
            <th className="px-4 py-3 w-32">Status</th>
            <th className="px-4 py-3 text-right w-32">Cost</th>
            <th className="px-4 py-3 text-right w-32">Additions</th>
            <th className="px-4 py-3 text-right w-32">Disposals</th>
            <th className="px-4 py-3 text-right w-32">Period Depr.</th>
            <th className="px-4 py-3 text-right w-32">Accum. Depr.</th>
            <th className="px-4 py-3 text-right w-32">NBV</th>
          </tr>
        </thead>
        {categories.map((category) => {
          const totals = data.category_totals[category.name]
          return (
            <tbody key={category.name}>
              <tr className="border-t border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40">
                <td colSpan={10} className="px-4 py-2 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                  {category.name}
                </td>
              </tr>
              {category.rows.map((row) => (
                <tr key={row.id} className="border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/60">
                  <td className="px-4 py-2.5 font-mono">
                    <Link to={`/app/fixed-assets/${row.id}`}
                      className="text-primary-600 dark:text-primary-400 hover:underline">
                      {row.code}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <Link to={`/app/fixed-assets/${row.id}`} className="hover:underline">{row.name}</Link>
                  </td>
                  <td className="px-4 py-2.5">{row.acquisition_date}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={row.status} /></td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(row.cost)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(row.addition_in_period)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(row.disposal_in_period)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(row.period_depreciation)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(row.accumulated_depreciation)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">{money(row.net_book_value)}</td>
                </tr>
              ))}
              {totals && (
                <tr className="border-t border-gray-100 dark:border-gray-700/50 font-medium text-gray-600 dark:text-gray-300">
                  <td className="px-4 py-2" colSpan={4}>Total {category.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(totals.cost)}</td>
                  <td className="px-4 py-2" colSpan={3} />
                  <td className="px-4 py-2 text-right tabular-nums">{money(totals.accum)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(totals.nbv)}</td>
                </tr>
              )}
            </tbody>
          )
        })}
        {data.rows.length === 0 && (
          <tbody>
            <tr><td colSpan={10} className="px-4 py-10 text-center text-gray-400">No assets registered yet.</td></tr>
          </tbody>
        )}
        <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold">
          <tr>
            <td className="px-4 py-3" colSpan={4}>Grand total</td>
            <td className="px-4 py-3 text-right tabular-nums">{money(data.total_cost)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{money(mv?.additions)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{money(mv?.disposals)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{money(mv?.period_charge)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{money(data.total_accumulated)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{money(data.total_nbv)}</td>
          </tr>
        </tfoot>
      </table>
      </div>
    </div>
  )
}
