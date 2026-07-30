import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Plus } from '@phosphor-icons/react'
import { accountsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { useUrlFilters, filtersToQuery, type FilterConfig } from '@/hooks/useUrlFilters'
import {
  Accordion,
  Badge,
  Button,
  CurrencyDisplay,
  FilterBar,
  PageHeader,
  RefreshingOverlay,
  refreshingContentClass,
  SkeletonTable,
} from '@/components/ui'
import AccountFormModal from './AccountFormModal'
import type { Account } from '@/types/accounting'

const TYPE_ORDER: Account['account_type'][] = ['asset', 'liability', 'equity', 'revenue', 'expense']
const TYPE_LABELS: Record<string, string> = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Accumulated Fund / Equity',
  revenue: 'Income',
  expense: 'Expenses',
}

// Static (stable identity — defined at module scope so filter hooks don't churn).
const ACCOUNT_TYPE_OPTIONS = TYPE_ORDER.map((t) => ({ value: t, label: TYPE_LABELS[t] }))

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD' },
  { value: 'ZWG', label: 'ZWG' },
]

const FILTER_CONFIG: FilterConfig = [
  { type: 'search', placeholder: 'Search by code or name…' },
  { type: 'chips', field: 'account_type', label: 'Type', multi: true, options: ACCOUNT_TYPE_OPTIONS },
  { type: 'chips', field: 'currency', label: 'Currency', options: CURRENCY_OPTIONS },
  { type: 'boolean', field: 'is_active', label: 'Active' },
]

export default function ChartOfAccounts() {
  const navigate = useNavigate()
  const filters = useUrlFilters(FILTER_CONFIG)
  const [showCreate, setShowCreate] = useState(false)

  const { data, isFetching } = useQuery({
    queryKey: qk.accounts.list(filters.params),
    queryFn: () => accountsApi.list(filtersToQuery(filters.params)).then((r) => r.data as Account[]),
    placeholderData: keepPreviousData,
  })
  const isRefreshing = isFetching && !!data

  const grouped = useMemo(() => {
    const accounts = data ?? []
    return TYPE_ORDER.map((type) => ({
      type,
      accounts: accounts.filter((a) => a.account_type === type),
    })).filter((g) => g.accounts.length > 0)
  }, [data])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chart of Accounts"
        description="Range-locked account codes; balances update in real time as documents post"
        icon={BookOpen}
        actions={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-2" /> New Account
          </Button>
        }
      />

      <FilterBar config={FILTER_CONFIG} filters={filters} />

      {!data ? (
        <SkeletonTable rows={10} />
      ) : (
        <div className="relative">
          <RefreshingOverlay active={isRefreshing} />
          <div className={refreshingContentClass(isRefreshing, 'space-y-4')}>
            {grouped.map(({ type, accounts }) => (
              <Accordion key={type} title={`${TYPE_LABELS[type]} (${accounts.length})`} defaultOpen>
                <table className="w-full text-sm">
                  <tbody>
                    {accounts.map((account) => (
                      <tr
                        key={account.id}
                        onClick={() => navigate(`/app/accounts/${account.id}`)}
                        className="border-b border-gray-100 dark:border-gray-700/50 last:border-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60"
                      >
                        <td className="py-2.5 pr-4 w-24 font-mono text-primary-600 dark:text-primary-400">
                          {account.code}
                        </td>
                        <td className="py-2.5 pr-4 text-gray-900 dark:text-gray-100">
                          {account.name}
                          {account.is_system && (
                            <Badge variant="secondary" className="ml-2">system</Badge>
                          )}
                          {!account.is_active && (
                            <Badge variant="danger" className="ml-2">inactive</Badge>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 w-20 text-gray-500">{account.currency || '—'}</td>
                        <td className="py-2.5 text-right w-36 tabular-nums">
                          <CurrencyDisplay amount={parseFloat(account.current_balance)} currency="USD" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Accordion>
            ))}
          </div>
        </div>
      )}

      <AccountFormModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}
