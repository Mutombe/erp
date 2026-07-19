import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Download } from 'lucide-react'
import { reportsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { exportToCSV, formatExportNumber } from '@/lib/export'
import { Button, SkeletonTable, StatusBadge } from '@/components/ui'
import type { AssetRegisterData } from '@/types/assets'

const money = (v: number | string) =>
  Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function AssetRegister() {
  const { data, isLoading } = useQuery({
    queryKey: qk.reports.assetRegister(),
    queryFn: () => reportsApi.assetRegister().then((r) => r.data as AssetRegisterData),
  })

  if (isLoading || !data) return <SkeletonTable rows={10} />

  // Group rows by category, preserving backend (code) order.
  const categories: { name: string; rows: AssetRegisterData['rows'] }[] = []
  for (const row of data.rows) {
    const existing = categories.find((c) => c.name === row.category)
    if (existing) existing.rows.push(row)
    else categories.push({ name: row.category, rows: [row] })
  }

  const handleExport = () =>
    exportToCSV(
      data.rows,
      [
        { key: 'code', header: 'Code' },
        { key: 'name', header: 'Asset' },
        { key: 'category', header: 'Category' },
        { key: 'acquisition_date', header: 'Acquired' },
        { key: 'status', header: 'Status' },
        { key: 'cost', header: 'Cost', format: formatExportNumber },
        { key: 'accumulated_depreciation', header: 'Accum. Depr.', format: formatExportNumber },
        { key: 'net_book_value', header: 'NBV', format: formatExportNumber },
      ],
      'asset-register'
    )

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" disabled={data.rows.length === 0} onClick={handleExport}>
          <Download className="w-4 h-4 mr-2" /> Export CSV
        </Button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
          <tr>
            <th className="px-4 py-3 w-28">Code</th>
            <th className="px-4 py-3">Asset</th>
            <th className="px-4 py-3 w-28">Acquired</th>
            <th className="px-4 py-3 w-32">Status</th>
            <th className="px-4 py-3 text-right w-36">Cost</th>
            <th className="px-4 py-3 text-right w-36">Accum. Depr.</th>
            <th className="px-4 py-3 text-right w-36">NBV</th>
          </tr>
        </thead>
        {categories.map((category) => {
          const totals = data.category_totals[category.name]
          return (
            <tbody key={category.name}>
              <tr className="border-t border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40">
                <td colSpan={7} className="px-4 py-2 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
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
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(row.accumulated_depreciation)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">{money(row.net_book_value)}</td>
                </tr>
              ))}
              {totals && (
                <tr className="border-t border-gray-100 dark:border-gray-700/50 font-medium text-gray-600 dark:text-gray-300">
                  <td className="px-4 py-2" colSpan={4}>Total {category.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(totals.cost)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(totals.accum)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(totals.nbv)}</td>
                </tr>
              )}
            </tbody>
          )
        })}
        {data.rows.length === 0 && (
          <tbody>
            <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">No assets registered yet.</td></tr>
          </tbody>
        )}
        <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold">
          <tr>
            <td className="px-4 py-3" colSpan={4}>Grand total</td>
            <td className="px-4 py-3 text-right tabular-nums">{money(data.total_cost)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{money(data.total_accumulated)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{money(data.total_nbv)}</td>
          </tr>
        </tfoot>
      </table>
      </div>
    </div>
  )
}
