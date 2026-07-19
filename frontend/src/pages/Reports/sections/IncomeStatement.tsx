import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { reportsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { SkeletonTable } from '@/components/ui'

interface ISRow { account_id: number; code: string; name: string; amount: number }
interface ISSection { group: string; rows: ISRow[]; total: number }
interface ISData {
  start: string
  end: string
  layout: string
  labels: { income: string; expenses: string; result: string }
  income: ISSection[]
  expenses: ISSection[]
  total_income: number
  total_expenses: number
  result: number
}

const GROUP_LABELS: Record<string, string> = {
  fee_income: 'Fee Income',
  other_income: 'Other Income',
  operating_expenses: 'Operating Expenses',
  administrative_expenses: 'Administrative Expenses',
  finance_costs: 'Finance Costs',
}

const money = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function IncomeStatement() {
  const yearStart = `${new Date().getFullYear()}-01-01`
  const [start, setStart] = useState(yearStart)
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10))
  const [layout, setLayout] = useState<'pnl' | 'ie'>('ie')

  const { data, isLoading } = useQuery({
    queryKey: qk.reports.incomeStatement({ start, end, layout }),
    queryFn: () => reportsApi.incomeStatement({ start, end, layout }).then((r) => r.data as ISData),
  })

  const renderSections = (sections: ISSection[]) =>
    sections.map((section) => (
      <div key={section.group} className="mb-3">
        <p className="text-xs uppercase text-gray-400 mb-1">{GROUP_LABELS[section.group] ?? section.group}</p>
        {section.rows.map((row) => (
          <div key={row.account_id} className="flex justify-between py-1 text-sm border-b border-gray-50 dark:border-gray-800">
            <Link to={`/app/accounts/${row.account_id}?from=${start}&to=${end}`}
              className="text-primary-600 dark:text-primary-400 hover:underline">
              <span className="font-mono text-xs mr-2">{row.code}</span>{row.name}
            </Link>
            <span className="tabular-nums">{money(row.amount)}</span>
          </div>
        ))}
        <div className="flex justify-between py-1 text-sm font-medium">
          <span>Total {GROUP_LABELS[section.group] ?? section.group}</span>
          <span className="tabular-nums">{money(section.total)}</span>
        </div>
      </div>
    ))

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-end gap-3 flex-wrap">
        <label className="text-sm text-gray-600 dark:text-gray-300">
          From
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
            className="block mt-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800" />
        </label>
        <label className="text-sm text-gray-600 dark:text-gray-300">
          To
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
            className="block mt-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800" />
        </label>
        <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600 text-sm">
          {(['ie', 'pnl'] as const).map((mode) => (
            <button key={mode} onClick={() => setLayout(mode)}
              className={`px-3 py-1.5 ${layout === mode ? 'bg-primary-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
              {mode === 'ie' ? 'Income & Expenditure' : 'Profit & Loss'}
            </button>
          ))}
        </div>
      </div>

      {isLoading || !data ? (
        <SkeletonTable rows={12} />
      ) : (
        <div className="space-y-6 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div>
            <h3 className="font-semibold mb-2">{data.labels.income}</h3>
            {renderSections(data.income)}
            <div className="flex justify-between font-bold border-t border-gray-200 dark:border-gray-700 pt-2">
              <span>Total {data.labels.income}</span><span className="tabular-nums">{money(data.total_income)}</span>
            </div>
          </div>
          <div>
            <h3 className="font-semibold mb-2">{data.labels.expenses}</h3>
            {renderSections(data.expenses)}
            <div className="flex justify-between font-bold border-t border-gray-200 dark:border-gray-700 pt-2">
              <span>Total {data.labels.expenses}</span><span className="tabular-nums">{money(data.total_expenses)}</span>
            </div>
          </div>
          <div className={`flex justify-between text-lg font-bold border-t-2 pt-3 ${data.result >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'} border-gray-300 dark:border-gray-600`}>
            <span>{data.labels.result}</span>
            <span className="tabular-nums">{money(data.result)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
