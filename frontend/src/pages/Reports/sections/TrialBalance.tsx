import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Download } from 'lucide-react'
import { reportsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { exportToCSV, formatExportNumber } from '@/lib/export'
import { Badge, Button, SkeletonTable } from '@/components/ui'

interface TBRow {
  account_id: number
  code: string
  name: string
  account_type: string
  debit: number
  credit: number
}

interface TBData {
  as_of_date: string
  rows: TBRow[]
  total_debit: number
  total_credit: number
  balanced: boolean
}

const money = (v: number) =>
  v ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''

export default function TrialBalance() {
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10))

  const { data, isLoading } = useQuery({
    queryKey: qk.reports.trialBalance({ asOf }),
    queryFn: () => reportsApi.trialBalance({ as_of_date: asOf }).then((r) => r.data as TBData),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <label className="text-sm text-gray-600 dark:text-gray-300">
          As at{' '}
          <input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="ml-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
          />
        </label>
        <div className="flex items-center gap-3">
          {data && (
            <Badge variant={data.balanced ? 'success' : 'danger'}>
              {data.balanced ? 'Balanced' : 'OUT OF BALANCE'}
            </Badge>
          )}
          <Button
            variant="secondary"
            size="sm"
            disabled={!data || data.rows.length === 0}
            onClick={() =>
              data &&
              exportToCSV(
                data.rows,
                [
                  { key: 'code', header: 'Code' },
                  { key: 'name', header: 'Account' },
                  { key: 'account_type', header: 'Type' },
                  { key: 'debit', header: 'Debit', format: formatExportNumber },
                  { key: 'credit', header: 'Credit', format: formatExportNumber },
                ],
                `trial-balance-${asOf}`
              )
            }
          >
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
        </div>
      </div>

      {isLoading || !data ? (
        <SkeletonTable rows={12} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3 w-24">Code</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3 text-right w-40">Debit</th>
                <th className="px-4 py-3 text-right w-40">Credit</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.account_id} className="border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/60">
                  <td className="px-4 py-2.5 font-mono">
                    <Link to={`/app/accounts/${row.account_id}?to=${asOf}`}
                      className="text-primary-600 dark:text-primary-400 hover:underline">
                      {row.code}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <Link to={`/app/accounts/${row.account_id}?to=${asOf}`} className="hover:underline">
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(row.debit)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(row.credit)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold">
              <tr>
                <td className="px-4 py-3" colSpan={2}>Totals</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(data.total_debit)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(data.total_credit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
