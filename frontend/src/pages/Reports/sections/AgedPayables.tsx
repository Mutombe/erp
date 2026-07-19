import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { reportsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { SkeletonTable } from '@/components/ui'

interface AgedRow {
  supplier_id: number
  supplier_code: string
  supplier_name: string
  currency: string
  buckets: (number | string)[]
  total: number | string
}

interface AgedData {
  as_of_date: string
  bucket_labels: string[]
  rows: AgedRow[]
  bucket_totals: (number | string)[]
  grand_total: number | string
}

const money = (v: number | string) =>
  Number(v) ? Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''

export default function AgedPayables() {
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10))

  const { data, isLoading } = useQuery({
    queryKey: qk.reports.agedPayables({ asOf }),
    queryFn: () => reportsApi.agedPayables({ as_of_date: asOf }).then((r) => r.data as AgedData),
  })

  return (
    <div className="space-y-4">
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

      {isLoading || !data ? (
        <SkeletonTable rows={8} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Ccy</th>
                {data.bucket_labels.map((label) => (
                  <th key={label} className="px-4 py-3 text-right">{label}</th>
                ))}
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.supplier_id} className="border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/60">
                  <td className="px-4 py-2.5">
                    <Link to={`/app/suppliers/${row.supplier_id}`}
                      className="text-primary-600 dark:text-primary-400 hover:underline">
                      <span className="font-mono text-xs mr-2">{row.supplier_code}</span>
                      {row.supplier_name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">{row.currency}</td>
                  {row.buckets.map((amount, i) => (
                    <td key={i} className={`px-4 py-2.5 text-right tabular-nums ${i >= 3 && Number(amount) > 0 ? 'text-red-600 dark:text-red-400 font-medium' : ''}`}>
                      {money(amount)}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{money(row.total)}</td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">Nothing owed to suppliers. 🎉</td></tr>
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
