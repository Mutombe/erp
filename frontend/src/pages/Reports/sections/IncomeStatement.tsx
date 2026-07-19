import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { reportsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { SkeletonTable } from '@/components/ui'

interface ISRow { account_id: number; code: string; name: string; amount: number; prev_amount?: number }
interface ISSection { group: string; rows: ISRow[]; total: number; prev_total?: number }
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
  compare?: string
  prev_total_income?: number
  prev_total_expenses?: number
  prev_result?: number
}

interface MonthlyRow {
  account_id: number
  code: string
  name: string
  months: Record<string, number>
  total: number
}

interface MonthlyData {
  mode: 'monthly'
  start: string
  end: string
  months: string[]
  income_rows: MonthlyRow[]
  expense_rows: MonthlyRow[]
  income_month_totals: Record<string, number>
  expense_month_totals: Record<string, number>
  result_by_month: Record<string, number>
  total_income: number
  total_expenses: number
  labels?: { income: string; expenses: string; result: string }
}

type CompareMode = '' | 'prior_period' | 'prior_year'

const GROUP_LABELS: Record<string, string> = {
  fee_income: 'Fee Income',
  other_income: 'Other Income',
  operating_expenses: 'Operating Expenses',
  administrative_expenses: 'Administrative Expenses',
  finance_costs: 'Finance Costs',
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const money = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const changePct = (current: number, prev: number | undefined) => {
  if (prev === undefined || prev === 0) return '—'
  const pct = ((current - prev) / Math.abs(prev)) * 100
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
}

export default function IncomeStatement() {
  const yearStart = `${new Date().getFullYear()}-01-01`
  const [start, setStart] = useState(yearStart)
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10))
  const [layout, setLayout] = useState<'pnl' | 'ie'>('ie')
  const [compare, setCompare] = useState<CompareMode>('')
  const [monthly, setMonthly] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: qk.reports.incomeStatement({ start, end, layout, compare, monthly }),
    queryFn: () => {
      const params: Record<string, string | number> = { start, end, layout }
      if (monthly) params.monthly = 1
      else if (compare) params.compare = compare
      return reportsApi.incomeStatement(params).then((r) => r.data as ISData | MonthlyData)
    },
  })

  const monthlyData = data && 'mode' in data && data.mode === 'monthly' ? (data as MonthlyData) : undefined
  const periodData = data && !(data && 'mode' in data) ? (data as ISData) : undefined
  const showPrev = !monthly && compare !== ''

  const monthLabel = (m: string) => {
    const [year, mm] = m.split('-')
    const name = MONTH_NAMES[Number(mm) - 1] ?? m
    const multiYear = monthlyData && new Set(monthlyData.months.map((x) => x.slice(0, 4))).size > 1
    return multiYear ? `${name} ${year.slice(2)}` : name
  }

  const renderSections = (sections: ISSection[]) =>
    sections.map((section) => (
      <div key={section.group} className="mb-3">
        <p className="text-xs uppercase text-gray-400 mb-1">{GROUP_LABELS[section.group] ?? section.group}</p>
        {section.rows.map((row) => (
          <div key={row.account_id} className="flex justify-between gap-4 py-1 text-sm border-b border-gray-50 dark:border-gray-800">
            <Link to={`/app/accounts/${row.account_id}?from=${start}&to=${end}`}
              className="text-primary-600 dark:text-primary-400 hover:underline min-w-0 truncate">
              <span className="font-mono text-xs mr-2">{row.code}</span>{row.name}
            </Link>
            <span className="flex gap-4 shrink-0">
              <span className="tabular-nums w-28 text-right">{money(row.amount)}</span>
              {showPrev && (
                <span className="tabular-nums w-28 text-right text-gray-500 dark:text-gray-400">
                  {money(row.prev_amount ?? 0)}
                </span>
              )}
            </span>
          </div>
        ))}
        <div className="flex justify-between gap-4 py-1 text-sm font-medium">
          <span>Total {GROUP_LABELS[section.group] ?? section.group}</span>
          <span className="flex gap-4 shrink-0">
            <span className="tabular-nums w-28 text-right">{money(section.total)}</span>
            {showPrev && (
              <span className="tabular-nums w-28 text-right text-gray-500 dark:text-gray-400">
                {money(section.prev_total ?? 0)}
              </span>
            )}
          </span>
        </div>
      </div>
    ))

  const totalLine = (label: string, current: number, prev: number | undefined, options?: { result?: boolean }) => (
    <div className={`flex justify-between gap-4 font-bold border-t pt-2 ${
      options?.result
        ? `text-lg border-t-2 pt-3 ${current >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'} border-gray-300 dark:border-gray-600`
        : 'border-gray-200 dark:border-gray-700'
    }`}>
      <span>{label}</span>
      <span className="flex gap-4 shrink-0 items-baseline">
        <span className="tabular-nums w-28 text-right">{money(current)}</span>
        {showPrev && (
          <>
            <span className="tabular-nums w-28 text-right text-gray-500 dark:text-gray-400">
              {money(prev ?? 0)}
            </span>
            <span className="tabular-nums w-20 text-right text-sm font-semibold text-gray-500 dark:text-gray-400">
              {changePct(current, prev)}
            </span>
          </>
        )}
      </span>
    </div>
  )

  const renderMonthlyRows = (rows: MonthlyRow[], months: string[]) =>
    rows.map((row) => (
      <tr key={row.account_id} className="border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/60">
        <td className="px-4 py-2 sticky left-0 bg-white dark:bg-gray-900 whitespace-nowrap">
          <Link to={`/app/accounts/${row.account_id}?from=${start}&to=${end}`}
            className="text-primary-600 dark:text-primary-400 hover:underline">
            <span className="font-mono text-xs mr-2">{row.code}</span>{row.name}
          </Link>
        </td>
        {months.map((m) => (
          <td key={m} className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
            {row.months[m] ? money(row.months[m]) : ''}
          </td>
        ))}
        <td className="px-4 py-2 text-right tabular-nums font-medium whitespace-nowrap">{money(row.total)}</td>
      </tr>
    ))

  const monthlyTotalRow = (label: string, byMonth: Record<string, number>, total: number, months: string[]) => (
    <tr className="border-t border-gray-200 dark:border-gray-700 font-semibold bg-gray-50 dark:bg-gray-800">
      <td className="px-4 py-2 sticky left-0 bg-gray-50 dark:bg-gray-800 whitespace-nowrap">{label}</td>
      {months.map((m) => (
        <td key={m} className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{money(byMonth[m] ?? 0)}</td>
      ))}
      <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">{money(total)}</td>
    </tr>
  )

  return (
    <div className={`space-y-4 ${monthly ? '' : 'max-w-3xl'}`}>
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
        <label className="text-sm text-gray-600 dark:text-gray-300">
          Compare
          <select value={compare} onChange={(e) => setCompare(e.target.value as CompareMode)} disabled={monthly}
            className="block mt-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 disabled:opacity-50">
            <option value="">None</option>
            <option value="prior_period">Prior period</option>
            <option value="prior_year">Prior year</option>
          </select>
        </label>
        <button onClick={() => setMonthly((v) => !v)}
          className={`px-3 py-1.5 text-sm rounded-lg border ${
            monthly
              ? 'bg-primary-600 text-white border-primary-600'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600'
          }`}>
          Monthly
        </button>
      </div>

      {isLoading || !data ? (
        <SkeletonTable rows={12} />
      ) : monthlyData ? (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3 sticky left-0 bg-gray-50 dark:bg-gray-800 min-w-[14rem]">Account</th>
                {monthlyData.months.map((m) => (
                  <th key={m} className="px-3 py-3 text-right whitespace-nowrap">{monthLabel(m)}</th>
                ))}
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-gray-50/60 dark:bg-gray-800/40">
                <td colSpan={monthlyData.months.length + 2}
                  className="px-4 py-2 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 sticky left-0">
                  Income
                </td>
              </tr>
              {renderMonthlyRows(monthlyData.income_rows, monthlyData.months)}
              {monthlyTotalRow('Total Income', monthlyData.income_month_totals, monthlyData.total_income, monthlyData.months)}
              <tr className="bg-gray-50/60 dark:bg-gray-800/40">
                <td colSpan={monthlyData.months.length + 2}
                  className="px-4 py-2 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 sticky left-0">
                  Expenses
                </td>
              </tr>
              {renderMonthlyRows(monthlyData.expense_rows, monthlyData.months)}
              {monthlyTotalRow('Total Expenses', monthlyData.expense_month_totals, monthlyData.total_expenses, monthlyData.months)}
            </tbody>
            <tfoot className="bg-gray-50 dark:bg-gray-800 font-bold">
              <tr className="border-t-2 border-gray-300 dark:border-gray-600">
                <td className="px-4 py-3 sticky left-0 bg-gray-50 dark:bg-gray-800 whitespace-nowrap">Surplus/(Deficit)</td>
                {monthlyData.months.map((m) => {
                  const v = monthlyData.result_by_month[m] ?? 0
                  return (
                    <td key={m} className={`px-3 py-3 text-right tabular-nums whitespace-nowrap ${v >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {money(v)}
                    </td>
                  )
                })}
                {(() => {
                  const total = monthlyData.total_income - monthlyData.total_expenses
                  return (
                    <td className={`px-4 py-3 text-right tabular-nums ${total >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {money(total)}
                    </td>
                  )
                })()}
              </tr>
            </tfoot>
          </table>
        </div>
      ) : periodData ? (
        <div className="space-y-6 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          {showPrev && (
            <div className="flex justify-between gap-4 text-xs uppercase text-gray-400 font-semibold">
              <span />
              <span className="flex gap-4 shrink-0">
                <span className="w-28 text-right">Current</span>
                <span className="w-28 text-right">
                  {compare === 'prior_year' ? 'Prior year' : 'Prior period'}
                </span>
              </span>
            </div>
          )}
          <div>
            <h3 className="font-semibold mb-2">{periodData.labels.income}</h3>
            {renderSections(periodData.income)}
            {totalLine(`Total ${periodData.labels.income}`, periodData.total_income, periodData.prev_total_income)}
          </div>
          <div>
            <h3 className="font-semibold mb-2">{periodData.labels.expenses}</h3>
            {renderSections(periodData.expenses)}
            {totalLine(`Total ${periodData.labels.expenses}`, periodData.total_expenses, periodData.prev_total_expenses)}
          </div>
          {totalLine(periodData.labels.result, periodData.result, periodData.prev_result, { result: true })}
        </div>
      ) : null}
    </div>
  )
}
