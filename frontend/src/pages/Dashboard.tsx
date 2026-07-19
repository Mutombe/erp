import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import {
  Warning,
  Money,
  CalendarDots,
  SquaresFour,
  Receipt,
  Users,
  Wallet,
} from '@phosphor-icons/react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { reportsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { useUIStore } from '@/stores/uiStore'
import { Card, CardHeader, PageHeader, SkeletonDashboard, StatsCard } from '@/components/ui'

interface DashboardData {
  term: { id: number; name: string } | null
  kpis: {
    billed_this_term: number
    collected_this_term: number
    collection_rate: number
    outstanding_fees: number
    overdue_fees: number
    active_students: number
  }
  bank_balances: { id: number; name: string; currency: string; balance: number | string }[]
  monthly_billed_vs_collected: { month: string; billed: number | string; collected: number | string }[]
  recent_receipts: {
    id: number
    number: string
    date: string
    student_id: number
    student_name: string
    amount: number | string
    currency: string
    method: string
  }[]
}

const money = (v: number | string | null | undefined) =>
  Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** '2026-03' -> 'Mar 26' */
function monthLabel(key: string): string {
  const [year, month] = key.split('-')
  const idx = Number(month) - 1
  return idx >= 0 && idx < 12 ? `${MONTHS[idx]} ${year.slice(2)}` : key
}

export default function Dashboard() {
  const navigate = useNavigate()
  const theme = useUIStore((s) => s.theme)
  const dark = theme === 'dark'

  const { data, isLoading } = useQuery({
    queryKey: qk.reports.dashboard,
    queryFn: () => reportsApi.dashboard().then((r) => r.data as DashboardData),
  })

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" description="An overview of your school's finances and operations" icon={SquaresFour} />
        <SkeletonDashboard />
      </div>
    )
  }

  const { kpis } = data
  const chartData = data.monthly_billed_vs_collected.map((row) => ({
    month: monthLabel(row.month),
    billed: Number(row.billed),
    collected: Number(row.collected),
  }))

  // Chart chrome, stepped per mode (validated palette: blue #2a78d6/#3987e5, green #008300)
  const billedColor = dark ? '#3987e5' : '#2a78d6'
  const collectedColor = '#008300'
  const gridColor = dark ? '#2c2c2a' : '#e1e0d9'
  const tickColor = '#898781'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={data.term ? `Current term: ${data.term.name}` : 'No current term set — configure one under Settings'}
        icon={SquaresFour}
      />

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatsCard
          title="Collected this term"
          value={money(kpis.collected_this_term)}
          subtitle={`of ${money(kpis.billed_this_term)} billed · ${kpis.collection_rate.toFixed(1)}% collection`}
          icon={Wallet}
          color="green"
        />
        <div
          role="button"
          tabIndex={0}
          className="cursor-pointer"
          onClick={() => navigate('/app/fee-invoices?status=posted')}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/app/fee-invoices?status=posted')}
        >
          <StatsCard
            title="Outstanding fees"
            value={money(kpis.outstanding_fees)}
            subtitle="All open invoices — click to review"
            icon={Money}
            color={Number(kpis.outstanding_fees) > 0 ? 'red' : 'blue'}
          />
        </div>
        <div
          role="button"
          tabIndex={0}
          className="cursor-pointer"
          onClick={() => navigate('/app/fee-invoices?status=posted')}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/app/fee-invoices?status=posted')}
        >
          <StatsCard
            title="Overdue fees"
            value={money(kpis.overdue_fees)}
            subtitle="Past due date — click to chase"
            icon={Warning}
            color={Number(kpis.overdue_fees) > 0 ? 'orange' : 'blue'}
          />
        </div>
        <div
          role="button"
          tabIndex={0}
          className="cursor-pointer"
          onClick={() => navigate('/app/students')}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/app/students')}
        >
          <StatsCard
            title="Active students"
            value={kpis.active_students.toLocaleString()}
            subtitle="Currently enrolled — click to view"
            icon={Users}
            color="purple"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Billed vs collected chart */}
        <Card className="xl:col-span-2">
          <CardHeader
            title="Billed vs collected by month"
            description="Invoices billed against receipts collected across the academic year"
          />
          {chartData.length === 0 ? (
            <div className="h-72 flex items-center justify-center text-gray-400 text-sm">
              No billing activity yet this academic year.
            </div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                  <CartesianGrid stroke={gridColor} vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: tickColor, fontSize: 12 }}
                    axisLine={{ stroke: gridColor }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: tickColor, fontSize: 12 }}
                    tickFormatter={(v: number) => v.toLocaleString()}
                    axisLine={false}
                    tickLine={false}
                    width={72}
                  />
                  <Tooltip
                    formatter={(value: number | string, name: string) => [money(value), name === 'billed' ? 'Billed' : 'Collected']}
                    cursor={{ fill: dark ? 'rgba(255,255,255,0.06)' : 'rgba(11,11,11,0.04)' }}
                    contentStyle={{
                      background: dark ? '#1a1a19' : '#fcfcfb',
                      border: `1px solid ${gridColor}`,
                      borderRadius: 8,
                      color: dark ? '#ffffff' : '#0b0b0b',
                      fontSize: 13,
                    }}
                  />
                  <Legend
                    formatter={(value: string) => (
                      <span style={{ color: tickColor, fontSize: 12 }}>
                        {value === 'billed' ? 'Billed' : 'Collected'}
                      </span>
                    )}
                  />
                  <Bar dataKey="billed" fill={billedColor} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Line
                    dataKey="collected"
                    stroke={collectedColor}
                    strokeWidth={2}
                    dot={{ r: 3, fill: collectedColor, strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Bank balances */}
        <Card padding="none" className="overflow-hidden">
          <button
            onClick={() => navigate('/app/bank-accounts')}
            className="w-full text-left px-6 pt-6 pb-4 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Bank balances</h3>
            <p className="text-sm text-gray-500 mt-0.5">Book balances per account — click to manage</p>
          </button>
          <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {data.bank_balances.length === 0 && (
              <p className="px-6 py-8 text-center text-sm text-gray-400">No active bank accounts.</p>
            )}
            {data.bank_balances.map((bank) => (
              <button
                key={bank.id}
                onClick={() => navigate('/app/bank-accounts')}
                className="w-full flex items-center justify-between px-6 py-3.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Money className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="truncate text-gray-900 dark:text-gray-100">{bank.name}</span>
                  <span className="text-xs text-gray-400">{bank.currency}</span>
                </span>
                <span className="tabular-nums font-medium">{money(bank.balance)}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      {/* Recent receipts */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-gray-400" /> Recent receipts
          </h2>
          <Link to="/app/receipts" className="text-sm text-primary-600 dark:text-primary-400 hover:underline">
            View all
          </Link>
        </div>
        {data.recent_receipts.length === 0 ? (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 py-10 text-center text-gray-400 text-sm">
            <CalendarDots className="w-8 h-8 mx-auto mb-2 opacity-50" />
            No receipts posted yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3">Number</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_receipts.map((receipt) => (
                  <tr key={receipt.id} className="border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/60">
                    <td className="px-4 py-2.5">
                      <Link to={`/app/receipts/${receipt.id}`}
                        className="font-mono text-primary-600 dark:text-primary-400 hover:underline">
                        {receipt.number}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">{receipt.date}</td>
                    <td className="px-4 py-2.5">
                      <Link to={`/app/students/${receipt.student_id}`} className="hover:underline">
                        {receipt.student_name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 capitalize">{receipt.method.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                      {receipt.currency} {money(receipt.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
