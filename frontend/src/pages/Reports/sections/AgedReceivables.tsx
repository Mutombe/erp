import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Download } from 'lucide-react'
import { reportsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { exportToCSV, formatExportNumber } from '@/lib/export'
import { Button, SkeletonTable } from '@/components/ui'

interface AgedRow {
  student_id: number
  student_code: string
  student_name: string
  grade: string
  currency: string
  buckets: number[]
  total: number
}

interface AgedData {
  as_of_date: string
  bucket_labels: string[]
  rows: AgedRow[]
  bucket_totals: number[]
  grand_total: number
}

const money = (v: number) =>
  v ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''

export default function AgedReceivables() {
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10))

  const { data, isLoading } = useQuery({
    queryKey: qk.reports.agedReceivables({ asOf }),
    queryFn: () => reportsApi.agedReceivables({ as_of_date: asOf }).then((r) => r.data as AgedData),
  })

  const handleExport = () => {
    if (!data) return
    const rows = data.rows.map((row) => {
      const flat: Record<string, string | number> = {
        student_code: row.student_code,
        student_name: row.student_name,
        grade: row.grade,
        currency: row.currency,
      }
      data.bucket_labels.forEach((_label, i) => {
        flat[`bucket_${i}`] = row.buckets[i] ?? 0
      })
      flat.total = row.total
      return flat
    })
    exportToCSV(
      rows,
      [
        { key: 'student_code', header: 'Code' },
        { key: 'student_name', header: 'Student' },
        { key: 'grade', header: 'Grade' },
        { key: 'currency', header: 'Currency' },
        ...data.bucket_labels.map((label, i) => ({
          key: `bucket_${i}`,
          header: label,
          format: formatExportNumber,
        })),
        { key: 'total', header: 'Total', format: formatExportNumber },
      ],
      `aged-receivables-${asOf}`
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <label className="text-sm text-gray-600 dark:text-gray-300">
            As at{' '}
            <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)}
              className="ml-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800" />
          </label>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            Balances as they stood on this date (later payments excluded)
          </p>
        </div>
        <Button variant="secondary" size="sm" disabled={!data || data.rows.length === 0} onClick={handleExport}>
          <Download className="w-4 h-4 mr-2" /> Export CSV
        </Button>
      </div>

      {isLoading || !data ? (
        <SkeletonTable rows={8} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Grade</th>
                {data.bucket_labels.map((label) => (
                  <th key={label} className="px-4 py-3 text-right">{label}</th>
                ))}
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.student_id} className="border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/60">
                  <td className="px-4 py-2.5">
                    <Link to={`/app/students/${row.student_id}?tab=invoices&status=overdue`}
                      className="text-primary-600 dark:text-primary-400 hover:underline">
                      <span className="font-mono text-xs mr-2">{row.student_code}</span>
                      {row.student_name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">{row.grade}</td>
                  {row.buckets.map((amount, i) => (
                    <td key={i} className={`px-4 py-2.5 text-right tabular-nums ${i >= 3 && amount > 0 ? 'text-red-600 dark:text-red-400 font-medium' : ''}`}>
                      {money(amount)}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{money(row.total)}</td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">No outstanding fees. 🎉</td></tr>
              )}
            </tbody>
            <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold">
              <tr>
                <td className="px-4 py-3" colSpan={2}>Totals</td>
                {data.bucket_totals.map((amount, i) => (
                  <td key={i} className="px-4 py-3 text-right tabular-nums">{money(amount)}</td>
                ))}
                <td className="px-4 py-3 text-right tabular-nums">{money(data.grand_total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
