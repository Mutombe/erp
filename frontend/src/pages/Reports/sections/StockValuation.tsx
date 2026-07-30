import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { DownloadSimple } from '@phosphor-icons/react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { reportsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { exportToCSV, formatExportNumber } from '@/lib/export'
import { useChartTheme, chartMoney, chartCompact } from '@/lib/chartTheme'
import { Button, RefreshingOverlay, SkeletonTable, refreshingContentClass } from '@/components/ui'
import PdfButton from './PdfButton'
import ExcelButton from './ExcelButton'
import ReportChart from './ReportChart'

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
  const theme = useChartTheme()
  const { data, isFetching } = useQuery({
    queryKey: qk.reports.stockValuation(),
    queryFn: () => reportsApi.stockValuation().then((r) => r.data as SVData),
  })

  // A background refetch keeps the valuation on screen; only first paint skeletons.
  const isRefreshing = isFetching && !!data

  if (!data) return <SkeletonTable rows={10} />

  // Value aggregated per category for the overview chart.
  const byCategory = Object.values(
    data.rows.reduce<Record<string, { name: string; value: number }>>((acc, r) => {
      const key = r.category || 'Uncategorised'
      acc[key] ??= { name: key, value: 0 }
      acc[key].value += Number(r.value)
      return acc
    }, {})
  ).sort((a, b) => b.value - a.value)

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
        <ExcelButton reportKey="stock-valuation" />
      </div>

      <ReportChart title="Stock value by category" height={240} isEmpty={byCategory.length === 0}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={byCategory} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid stroke={theme.grid} vertical={false} />
            <XAxis dataKey="name" tick={{ fill: theme.tick, fontSize: 11 }} axisLine={{ stroke: theme.grid }} tickLine={false} interval={0} height={44} angle={-10} textAnchor="end" />
            <YAxis tick={{ fill: theme.tick, fontSize: 12 }} tickFormatter={chartCompact} axisLine={false} tickLine={false} width={56} />
            <Tooltip
              formatter={(v: number | string) => [chartMoney(v), 'Value']}
              cursor={{ fill: theme.cursorFill }}
              contentStyle={theme.tooltipStyle}
            />
            <Bar dataKey="value" fill={theme.primary} radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={!theme.reducedMotion} />
          </BarChart>
        </ResponsiveContainer>
      </ReportChart>

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
