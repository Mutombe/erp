import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { DownloadSimple } from '@phosphor-icons/react'
import { reportsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { exportToCSV, formatExportNumber } from '@/lib/export'
import { Button, RefreshingOverlay, SkeletonTable, refreshingContentClass } from '@/components/ui'
import PdfButton from './PdfButton'

interface DCRow {
  department_id: number
  department_code: string
  department_name: string
  issue_count: number
  total_cost: number | string
}

interface DCItemRow {
  department_name: string
  item_code: string
  item_name: string
  quantity: number | string
  total_cost: number | string
}

interface DCData {
  start: string
  end: string
  rows: DCRow[]
  total_cost: number | string
  by_item: DCItemRow[]
}

const money = (v: number | string) =>
  Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const qty = (v: number | string) =>
  Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })

function startOfYear() {
  return `${new Date().getFullYear()}-01-01`
}

export default function DepartmentConsumption() {
  const [start, setStart] = useState(startOfYear())
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10))

  const { data, isFetching } = useQuery({
    queryKey: qk.reports.departmentConsumption({ start, end }),
    queryFn: () =>
      reportsApi.departmentConsumption({ start, end }).then((r) => r.data as DCData),
    placeholderData: keepPreviousData,
  })

  // Changing the range refreshes in place — the previous figures stay readable.
  const isRefreshing = isFetching && !!data

  const handleExport = () => {
    if (!data) return
    exportToCSV(
      data.rows,
      [
        { key: 'department_code', header: 'Code' },
        { key: 'department_name', header: 'Department' },
        { key: 'issue_count', header: 'Issues' },
        { key: 'total_cost', header: 'Total cost', format: formatExportNumber },
      ],
      'department-consumption'
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-4 flex-wrap text-sm text-gray-600 dark:text-gray-300">
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
        <div className="ml-auto flex gap-3">
          <Button
            variant="secondary"
            size="sm"
            disabled={!data || data.rows.length === 0}
            onClick={handleExport}
          >
            <DownloadSimple className="w-4 h-4 mr-2" /> Export CSV
          </Button>
          <PdfButton reportKey="department-consumption" params={{ start, end }} />
        </div>
      </div>

      {!data ? (
        <SkeletonTable rows={8} />
      ) : (
        <div className="space-y-6">
          <div className="relative overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
            <RefreshingOverlay active={isRefreshing} />
            <table className={refreshingContentClass(isRefreshing, 'w-full text-sm')}>
              <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3 text-right">Issues</th>
                  <th className="px-4 py-3 text-right">Total cost</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.department_id} className="border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/60">
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs mr-2 text-gray-400">{row.department_code}</span>
                      {row.department_name}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{row.issue_count}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">{money(row.total_cost)}</td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-10 text-center text-gray-400">No stock issued to any department in this range.</td></tr>
                )}
              </tbody>
              <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold">
                <tr>
                  <td className="px-4 py-3" colSpan={2}>Total consumption</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(data.total_cost)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
              Top items by department
            </h3>
            <div className="relative overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
              <RefreshingOverlay active={isRefreshing} />
              <table className={refreshingContentClass(isRefreshing, 'w-full text-sm')}>
                <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3 text-right">Quantity</th>
                    <th className="px-4 py-3 text-right">Total cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_item.map((row, i) => (
                    <tr key={`${row.department_name}-${row.item_code}-${i}`} className="border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/60">
                      <td className="px-4 py-2.5">{row.department_name}</td>
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-xs mr-2 text-gray-400">{row.item_code}</span>
                        {row.item_name}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{qty(row.quantity)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{money(row.total_cost)}</td>
                    </tr>
                  ))}
                  {data.by_item.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-10 text-center text-gray-400">Nothing issued in this range.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
