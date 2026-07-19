import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DownloadSimple } from '@phosphor-icons/react'
import { reportsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { exportToCSV, formatExportNumber } from '@/lib/export'
import { Button, SkeletonTable } from '@/components/ui'
import PdfButton from './PdfButton'

type Num = number | string

interface CFRow {
  group: string
  journal_type: string
  inflow: Num
  outflow: Num
  net: Num
}

interface CFData {
  start: string
  end: string
  opening_cash: Num
  rows: CFRow[]
  net_movement: Num
  closing_cash: Num
}

const money = (v: Num) =>
  Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const netClass = (v: Num) =>
  Number(v) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'

export default function CashFlow() {
  const today = new Date().toISOString().slice(0, 10)
  const [start, setStart] = useState(`${new Date().getFullYear()}-01-01`)
  const [end, setEnd] = useState(today)

  const { data, isLoading } = useQuery({
    queryKey: qk.reports.cashFlow({ start, end }),
    queryFn: () => reportsApi.cashFlow({ start, end }).then((r) => r.data as CFData),
  })

  const handleExport = () => {
    if (!data) return
    const rows: Record<string, Num>[] = [
      { group: 'Opening cash', inflow: '', outflow: '', net: data.opening_cash },
      ...data.rows.map((r) => ({ group: r.group, inflow: r.inflow, outflow: r.outflow, net: r.net })),
      { group: 'Net movement', inflow: '', outflow: '', net: data.net_movement },
      { group: 'Closing cash', inflow: '', outflow: '', net: data.closing_cash },
    ]
    exportToCSV(
      rows,
      [
        { key: 'group', header: 'Category' },
        { key: 'inflow', header: 'Inflows', format: (v) => (v === '' ? '' : formatExportNumber(v)) },
        { key: 'outflow', header: 'Outflows', format: (v) => (v === '' ? '' : formatExportNumber(v)) },
        { key: 'net', header: 'Net', format: formatExportNumber },
      ],
      `cash-flow-${start}-to-${end}`
    )
  }

  return (
    <div className="space-y-4 max-w-3xl">
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
          <Button variant="secondary" size="sm" disabled={!data} onClick={handleExport}>
            <DownloadSimple className="w-4 h-4 mr-2" /> Export CSV
          </Button>
          <PdfButton reportKey="cash-flow" params={{ start, end }} />
        </div>
      </div>

      {isLoading || !data ? (
        <SkeletonTable rows={10} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right w-36">Inflows</th>
                <th className="px-4 py-3 text-right w-36">Outflows</th>
                <th className="px-4 py-3 text-right w-36">Net</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-gray-100 dark:border-gray-700/50 font-medium bg-gray-50/60 dark:bg-gray-800/40">
                <td className="px-4 py-2.5" colSpan={3}>Opening cash</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{money(data.opening_cash)}</td>
              </tr>
              {data.rows.map((row) => (
                <tr key={`${row.group}-${row.journal_type}`} className="border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/60">
                  <td className="px-4 py-2.5">{row.group}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{Number(row.inflow) ? money(row.inflow) : ''}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{Number(row.outflow) ? money(row.outflow) : ''}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${netClass(row.net)}`}>{money(row.net)}</td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-gray-400">No cash movements in this period.</td></tr>
              )}
              <tr className="border-t border-gray-200 dark:border-gray-700 font-semibold">
                <td className="px-4 py-2.5" colSpan={3}>Net movement</td>
                <td className={`px-4 py-2.5 text-right tabular-nums ${netClass(data.net_movement)}`}>{money(data.net_movement)}</td>
              </tr>
            </tbody>
            <tfoot className="bg-gray-50 dark:bg-gray-800 font-bold">
              <tr>
                <td className="px-4 py-3" colSpan={3}>Closing cash</td>
                <td className={`px-4 py-3 text-right tabular-nums ${netClass(data.closing_cash)}`}>{money(data.closing_cash)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
