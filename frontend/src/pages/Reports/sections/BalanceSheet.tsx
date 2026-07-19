import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { reportsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { Badge, SkeletonTable } from '@/components/ui'

interface BSRow { account_id: number | null; code: string; name: string; balance: number }
interface BSSection { group: string; rows: BSRow[]; total: number }
interface BSData {
  as_of_date: string
  assets: BSSection[]
  liabilities: BSSection[]
  equity: BSSection[]
  total_assets: number
  total_liabilities: number
  total_equity: number
  balanced: boolean
}

const GROUP_LABELS: Record<string, string> = {
  current_assets: 'Current Assets',
  non_current_assets: 'Non-current Assets',
  current_liabilities: 'Current Liabilities',
  non_current_liabilities: 'Non-current Liabilities',
  equity: 'Accumulated Fund',
  surplus_to_date: 'Current Period',
}

const money = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function Section({ title, sections, asOf }: { title: string; sections: BSSection[]; asOf: string }) {
  return (
    <div>
      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">{title}</h3>
      {sections.map((section) => (
        <div key={section.group} className="mb-3">
          <p className="text-xs uppercase text-gray-400 mb-1">{GROUP_LABELS[section.group] ?? section.group}</p>
          {section.rows.map((row) => (
            <div key={`${section.group}-${row.code}-${row.name}`} className="flex justify-between py-1 text-sm border-b border-gray-50 dark:border-gray-800">
              <span>
                {row.account_id ? (
                  <Link to={`/app/accounts/${row.account_id}?to=${asOf}`}
                    className="text-primary-600 dark:text-primary-400 hover:underline">
                    <span className="font-mono text-xs mr-2">{row.code}</span>{row.name}
                  </Link>
                ) : row.name}
              </span>
              <span className="tabular-nums">{money(row.balance)}</span>
            </div>
          ))}
          <div className="flex justify-between py-1 text-sm font-medium">
            <span>Total {GROUP_LABELS[section.group] ?? section.group}</span>
            <span className="tabular-nums">{money(section.total)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function BalanceSheet() {
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10))
  const { data, isLoading } = useQuery({
    queryKey: qk.reports.balanceSheet({ asOf }),
    queryFn: () => reportsApi.balanceSheet({ as_of_date: asOf }).then((r) => r.data as BSData),
  })

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <label className="text-sm text-gray-600 dark:text-gray-300">
          As at{' '}
          <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)}
            className="ml-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800" />
        </label>
        {data && (
          <Badge variant={data.balanced ? 'success' : 'danger'}>
            {data.balanced ? 'Balanced' : 'OUT OF BALANCE'}
          </Badge>
        )}
      </div>
      {isLoading || !data ? (
        <SkeletonTable rows={12} />
      ) : (
        <div className="space-y-6 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <Section title="Assets" sections={data.assets} asOf={asOf} />
          <div className="flex justify-between font-bold border-t-2 border-gray-300 dark:border-gray-600 pt-2">
            <span>Total Assets</span><span className="tabular-nums">{money(data.total_assets)}</span>
          </div>
          <Section title="Liabilities" sections={data.liabilities} asOf={asOf} />
          <div className="flex justify-between font-bold border-t border-gray-200 dark:border-gray-700 pt-2">
            <span>Total Liabilities</span><span className="tabular-nums">{money(data.total_liabilities)}</span>
          </div>
          <Section title="Accumulated Fund" sections={data.equity} asOf={asOf} />
          <div className="flex justify-between font-bold border-t-2 border-gray-300 dark:border-gray-600 pt-2">
            <span>Total Liabilities & Fund</span>
            <span className="tabular-nums">{money(data.total_liabilities + data.total_equity)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
