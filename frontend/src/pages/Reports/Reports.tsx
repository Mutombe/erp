import { lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChartBar } from '@phosphor-icons/react'
import { PageHeader, SkeletonTable } from '@/components/ui'

const TrialBalance = lazy(() => import('./sections/TrialBalance'))
const BalanceSheet = lazy(() => import('./sections/BalanceSheet'))
const IncomeStatement = lazy(() => import('./sections/IncomeStatement'))
const AgedReceivables = lazy(() => import('./sections/AgedReceivables'))
const FeeCollection = lazy(() => import('./sections/FeeCollection'))
const AgedPayables = lazy(() => import('./sections/AgedPayables'))
const Cashbook = lazy(() => import('./sections/Cashbook'))
const CashFlow = lazy(() => import('./sections/CashFlow'))
const AssetRegister = lazy(() => import('./sections/AssetRegister'))
const StockValuation = lazy(() => import('./sections/StockValuation'))
const DepartmentConsumption = lazy(() => import('./sections/DepartmentConsumption'))

const REPORTS: { key: string; label: string; group: string; component?: React.LazyExoticComponent<() => JSX.Element> }[] = [
  { key: 'trial-balance', label: 'Trial Balance', group: 'Financial', component: TrialBalance },
  { key: 'balance-sheet', label: 'Balance Sheet', group: 'Financial', component: BalanceSheet },
  { key: 'income-statement', label: 'Income Statement / I&E', group: 'Financial', component: IncomeStatement },
  { key: 'cash-flow', label: 'Cash Flow', group: 'Financial', component: CashFlow },
  { key: 'cashbook', label: 'Cashbook', group: 'Financial', component: Cashbook },
  { key: 'aged-receivables', label: 'Aged Debtors (Fees)', group: 'Fees', component: AgedReceivables },
  { key: 'fee-collection', label: 'Fee Collection', group: 'Fees', component: FeeCollection },
  { key: 'aged-payables', label: 'Aged Creditors', group: 'Purchasing', component: AgedPayables },
  { key: 'asset-register', label: 'Asset Register', group: 'Assets', component: AssetRegister },
  { key: 'stock-valuation', label: 'Stock Valuation', group: 'Inventory', component: StockValuation },
  { key: 'department-consumption', label: 'Department Consumption', group: 'Inventory', component: DepartmentConsumption },
]

export default function Reports() {
  const [searchParams, setSearchParams] = useSearchParams()
  const active = searchParams.get('report') ?? 'trial-balance'
  const activeReport = REPORTS.find((r) => r.key === active) ?? REPORTS[0]
  const ActiveComponent = activeReport.component

  const groups = [...new Set(REPORTS.map((r) => r.group))]

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Period-strict, computed from the general ledger" icon={ChartBar} />
      <div className="flex flex-col lg:flex-row gap-6">
        <aside className="lg:w-56 shrink-0 space-y-4">
          {groups.map((group) => (
            <div key={group}>
              <p className="text-xs uppercase font-semibold text-gray-400 mb-1.5">{group}</p>
              <div className="space-y-0.5">
                {REPORTS.filter((r) => r.group === group).map((report) => (
                  <button
                    key={report.key}
                    onClick={() => setSearchParams({ report: report.key })}
                    className={`w-full text-left px-3 py-1.5 text-sm rounded-lg ${
                      active === report.key
                        ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    {report.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </aside>
        <div className="flex-1 min-w-0">
          {ActiveComponent ? (
            <Suspense fallback={<SkeletonTable rows={10} />}>
              <ActiveComponent />
            </Suspense>
          ) : (
            <div className="py-20 text-center text-gray-400">
              {activeReport.label} is coming soon.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
