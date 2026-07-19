import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { reportsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { Badge, SkeletonTable } from '@/components/ui'

interface BSRow { account_id: number | null; code: string; name: string; balance: number; prev_balance?: number }
interface BSSection { group: string; rows: BSRow[]; total: number; prev_total?: number }
interface BSData {
  as_of_date: string
  assets: BSSection[]
  liabilities: BSSection[]
  equity: BSSection[]
  total_assets: number
  total_liabilities: number
  total_equity: number
  balanced: boolean
  compare_date?: string
  prev_total_assets?: number
  prev_total_liabilities?: number
  prev_total_equity?: number
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

function Amounts({ current, prev, showPrev }: { current: number; prev?: number; showPrev: boolean }) {
  return (
    <span className="flex gap-4 shrink-0">
      <span className="tabular-nums w-28 text-right">{money(current)}</span>
      {showPrev && (
        <span className="tabular-nums w-28 text-right text-gray-500 dark:text-gray-400">{money(prev ?? 0)}</span>
      )}
    </span>
  )
}

function Section({ title, sections, asOf, showPrev }: { title: string; sections: BSSection[]; asOf: string; showPrev: boolean }) {
  return (
    <div>
      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">{title}</h3>
      {sections.map((section) => (
        <div key={section.group} className="mb-3">
          <p className="text-xs uppercase text-gray-400 mb-1">{GROUP_LABELS[section.group] ?? section.group}</p>
          {section.rows.map((row) => (
            <div key={`${section.group}-${row.code}-${row.name}`} className="flex justify-between gap-4 py-1 text-sm border-b border-gray-50 dark:border-gray-800">
              <span className="min-w-0 truncate">
                {row.account_id ? (
                  <Link to={`/app/accounts/${row.account_id}?to=${asOf}`}
                    className="text-primary-600 dark:text-primary-400 hover:underline">
                    <span className="font-mono text-xs mr-2">{row.code}</span>{row.name}
                  </Link>
                ) : row.name}
              </span>
              <Amounts current={row.balance} prev={row.prev_balance} showPrev={showPrev} />
            </div>
          ))}
          <div className="flex justify-between gap-4 py-1 text-sm font-medium">
            <span>Total {GROUP_LABELS[section.group] ?? section.group}</span>
            <Amounts current={section.total} prev={section.prev_total} showPrev={showPrev} />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function BalanceSheet() {
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10))
  const [compareDate, setCompareDate] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: qk.reports.balanceSheet({ asOf, compareDate }),
    queryFn: () => {
      const params: Record<string, string> = { as_of_date: asOf }
      if (compareDate) params.compare_date = compareDate
      return reportsApi.balanceSheet(params).then((r) => r.data as BSData)
    },
  })

  const showPrev = Boolean(compareDate)

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center flex-wrap gap-3">
          <label className="text-sm text-gray-600 dark:text-gray-300">
            As at{' '}
            <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)}
              className="ml-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800" />
          </label>
          <label className="text-sm text-gray-600 dark:text-gray-300">
            Compare with{' '}
            <input type="date" value={compareDate} onChange={(e) => setCompareDate(e.target.value)}
              className="ml-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800" />
          </label>
          {compareDate && (
            <button onClick={() => setCompareDate('')}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 underline">
              Clear
            </button>
          )}
        </div>
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
          {showPrev && (
            <div className="flex justify-between gap-4 text-xs uppercase text-gray-400 font-semibold">
              <span />
              <span className="flex gap-4 shrink-0">
                <span className="w-28 text-right">{asOf}</span>
                <span className="w-28 text-right">{compareDate}</span>
              </span>
            </div>
          )}
          <Section title="Assets" sections={data.assets} asOf={asOf} showPrev={showPrev} />
          <div className="flex justify-between gap-4 font-bold border-t-2 border-gray-300 dark:border-gray-600 pt-2">
            <span>Total Assets</span>
            <Amounts current={data.total_assets} prev={data.prev_total_assets} showPrev={showPrev} />
          </div>
          <Section title="Liabilities" sections={data.liabilities} asOf={asOf} showPrev={showPrev} />
          <div className="flex justify-between gap-4 font-bold border-t border-gray-200 dark:border-gray-700 pt-2">
            <span>Total Liabilities</span>
            <Amounts current={data.total_liabilities} prev={data.prev_total_liabilities} showPrev={showPrev} />
          </div>
          <Section title="Accumulated Fund" sections={data.equity} asOf={asOf} showPrev={showPrev} />
          <div className="flex justify-between gap-4 font-bold border-t-2 border-gray-300 dark:border-gray-600 pt-2">
            <span>Total Liabilities & Fund</span>
            <Amounts
              current={data.total_liabilities + data.total_equity}
              prev={
                data.prev_total_liabilities !== undefined || data.prev_total_equity !== undefined
                  ? (data.prev_total_liabilities ?? 0) + (data.prev_total_equity ?? 0)
                  : undefined
              }
              showPrev={showPrev}
            />
          </div>
        </div>
      )}
    </div>
  )
}
