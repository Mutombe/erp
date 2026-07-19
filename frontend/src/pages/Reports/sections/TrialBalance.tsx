import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { DownloadSimple } from '@phosphor-icons/react'
import { reportsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { exportToCSV, formatExportNumber } from '@/lib/export'
import { Badge, Button, SkeletonTable } from '@/components/ui'
import PdfButton from './PdfButton'

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

interface TBMovementRow {
  account_id: number
  code: string
  name: string
  account_type: string
  opening: number
  debit: number
  credit: number
  closing: number
}

interface TBMovementData {
  mode: 'movements'
  start: string
  end: string
  rows: TBMovementRow[]
  totals: { opening: number; debit: number; credit: number; closing: number }
  balanced: boolean
}

const money = (v: number) =>
  v ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''

const dateInputClass =
  'ml-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'

export default function TrialBalance() {
  const today = new Date().toISOString().slice(0, 10)
  const monthStart = `${today.slice(0, 7)}-01`
  const [mode, setMode] = useState<'asat' | 'movements'>('asat')
  const [asOf, setAsOf] = useState(today)
  const [start, setStart] = useState(monthStart)
  const [end, setEnd] = useState(today)

  const asAtQuery = useQuery({
    queryKey: qk.reports.trialBalance({ asOf }),
    queryFn: () => reportsApi.trialBalance({ as_of_date: asOf }).then((r) => r.data as TBData),
    enabled: mode === 'asat',
  })

  const movementQuery = useQuery({
    queryKey: qk.reports.trialBalance({ start, end }),
    queryFn: () => reportsApi.trialBalance({ start, end }).then((r) => r.data as TBMovementData),
    enabled: mode === 'movements',
  })

  const data = mode === 'asat' ? asAtQuery.data : undefined
  const movData = mode === 'movements' ? movementQuery.data : undefined
  const isLoading = mode === 'asat' ? asAtQuery.isLoading : movementQuery.isLoading
  const balanced = mode === 'asat' ? data?.balanced : movData?.balanced
  const hasRows = mode === 'asat' ? (data?.rows.length ?? 0) > 0 : (movData?.rows.length ?? 0) > 0

  const handleExport = () => {
    if (mode === 'asat' && data) {
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
    } else if (mode === 'movements' && movData) {
      exportToCSV(
        movData.rows,
        [
          { key: 'code', header: 'Code' },
          { key: 'name', header: 'Account' },
          { key: 'account_type', header: 'Type' },
          { key: 'opening', header: 'Opening', format: formatExportNumber },
          { key: 'debit', header: 'Debit', format: formatExportNumber },
          { key: 'credit', header: 'Credit', format: formatExportNumber },
          { key: 'closing', header: 'Closing', format: formatExportNumber },
        ],
        `trial-balance-movements-${start}-to-${end}`
      )
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center flex-wrap gap-3">
          <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600 text-sm">
            {(['asat', 'movements'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 ${
                  mode === m
                    ? 'bg-primary-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                }`}
              >
                {m === 'asat' ? 'As at' : 'Movements'}
              </button>
            ))}
          </div>
          {mode === 'asat' ? (
            <label className="text-sm text-gray-600 dark:text-gray-300">
              As at{' '}
              <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className={dateInputClass} />
            </label>
          ) : (
            <>
              <label className="text-sm text-gray-600 dark:text-gray-300">
                From{' '}
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={dateInputClass} />
              </label>
              <label className="text-sm text-gray-600 dark:text-gray-300">
                To{' '}
                <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={dateInputClass} />
              </label>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {balanced !== undefined && (
            <Badge variant={balanced ? 'success' : 'danger'}>
              {balanced ? 'Balanced' : 'OUT OF BALANCE'}
            </Badge>
          )}
          <Button variant="secondary" size="sm" disabled={!hasRows} onClick={handleExport}>
            <DownloadSimple className="w-4 h-4 mr-2" /> Export CSV
          </Button>
          <PdfButton
            reportKey="trial-balance"
            params={mode === 'asat' ? { as_of_date: asOf } : { start, end }}
          />
        </div>
      </div>

      {isLoading || (mode === 'asat' ? !data : !movData) ? (
        <SkeletonTable rows={12} />
      ) : mode === 'asat' && data ? (
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
      ) : movData ? (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3 w-24">Code</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3 text-right w-36">Opening</th>
                <th className="px-4 py-3 text-right w-36">Debits</th>
                <th className="px-4 py-3 text-right w-36">Credits</th>
                <th className="px-4 py-3 text-right w-36">Closing</th>
              </tr>
            </thead>
            <tbody>
              {movData.rows.map((row) => (
                <tr key={row.account_id} className="border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/60">
                  <td className="px-4 py-2.5 font-mono">
                    <Link to={`/app/accounts/${row.account_id}?from=${start}&to=${end}`}
                      className="text-primary-600 dark:text-primary-400 hover:underline">
                      {row.code}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <Link to={`/app/accounts/${row.account_id}?from=${start}&to=${end}`} className="hover:underline">
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(row.opening)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(row.debit)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(row.credit)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">{money(row.closing)}</td>
                </tr>
              ))}
              {movData.rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">No movements in this period.</td></tr>
              )}
            </tbody>
            <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold">
              <tr>
                <td className="px-4 py-3" colSpan={2}>Totals</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(movData.totals.opening)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(movData.totals.debit)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(movData.totals.credit)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(movData.totals.closing)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
    </div>
  )
}
