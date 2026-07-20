import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { DownloadSimple } from '@phosphor-icons/react'
import { reportsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { exportToCSV, formatExportNumber } from '@/lib/export'
import { Button, RefreshingOverlay, SkeletonTable, refreshingContentClass } from '@/components/ui'
import PdfButton from './PdfButton'

interface SVRow {
  item_id: number
  item_code: string
  item_name: string
  category: string
  warehouse: string
  quantity: number | string
  avg_cost: number | string
  value: number | string
}

interface SVData {
  rows: SVRow[]
  total_value: number | string
}

const money = (v: number | string) =>
  Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const qty = (v: number | string) =>
  Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })

export default function StockValuation() {
  const { data, isFetching } = useQuery({
    queryKey: qk.reports.stockValuation(),
    queryFn: () => reportsApi.stockValuation().then((r) => r.data as SVData),
  })

  // A background refetch keeps the valuation on screen; only first paint skeletons.
  const isRefreshing = isFetching && !!data

  if (!data) return <SkeletonTable rows={10} />

  const handleExport = () =>
    exportToCSV(
      data.rows,
      [
        { key: 'item_code', header: 'Code' },
        { key: 'item_name', header: 'Item' },
        { key: 'category', header: 'Category' },
        { key: 'warehouse', header: 'Warehouse' },
        { key: 'quantity', header: 'Qty on hand', format: formatExportNumber },
        { key: 'avg_cost', header: 'Avg cost', format: formatExportNumber },
        { key: 'value', header: 'Value', format: formatExportNumber },
      ],
      'stock-valuation'
    )

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-3">
        <Button variant="secondary" size="sm" disabled={data.rows.length === 0} onClick={handleExport}>
          <DownloadSimple className="w-4 h-4 mr-2" /> Export CSV
        </Button>
        <PdfButton reportKey="stock-valuation" />
      </div>
      <div className="relative overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
      <RefreshingOverlay active={isRefreshing} />
      <table className={refreshingContentClass(isRefreshing, 'w-full text-sm')}>
        <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
          <tr>
            <th className="px-4 py-3">Item</th>
            <th className="px-4 py-3">Category</th>
            <th className="px-4 py-3">Warehouse</th>
            <th className="px-4 py-3 text-right">Qty on hand</th>
            <th className="px-4 py-3 text-right">Avg cost</th>
            <th className="px-4 py-3 text-right">Value</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, i) => (
            <tr key={`${row.item_id}-${row.warehouse}-${i}`} className="border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/60">
              <td className="px-4 py-2.5">
                <Link to={`/app/items/${row.item_id}`}
                  className="text-primary-600 dark:text-primary-400 hover:underline">
                  <span className="font-mono text-xs mr-2">{row.item_code}</span>
                  {row.item_name}
                </Link>
              </td>
              <td className="px-4 py-2.5">{row.category}</td>
              <td className="px-4 py-2.5">{row.warehouse}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{qty(row.quantity)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{money(row.avg_cost)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums font-medium">{money(row.value)}</td>
            </tr>
          ))}
          {data.rows.length === 0 && (
            <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">No stock on hand.</td></tr>
          )}
        </tbody>
        <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold">
          <tr>
            <td className="px-4 py-3" colSpan={5}>Total stock value</td>
            <td className="px-4 py-3 text-right tabular-nums">{money(data.total_value)}</td>
          </tr>
        </tfoot>
      </table>
      </div>
    </div>
  )
}
