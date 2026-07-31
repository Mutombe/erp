import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Plus } from '@phosphor-icons/react'
import { accountsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { usePagedList } from '@/hooks/usePaginatedQuery'
import { usePrefetchDetail } from '@/hooks/usePrefetch'
import { useUrlFilters, filtersToQuery, type FilterConfig } from '@/hooks/useUrlFilters'
import { useCan } from '@/hooks/useCan'
import {
  Badge,
  Button,
  CurrencyDisplay,
  DataTable,
  FilterBar,
  PageHeader,
  RefreshingOverlay,
  refreshingContentClass,
  type Column,
} from '@/components/ui'
import AccountFormModal from './AccountFormModal'
import type { Account, Paginated } from '@/types/accounting'

const PAGE_SIZE = 25

const TYPE_ORDER: Account['account_type'][] = ['asset', 'liability', 'equity', 'revenue', 'expense']
const TYPE_LABELS: Record<string, string> = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Accumulated Fund / Equity',
  revenue: 'Income',
  expense: 'Expenses',
}

const TYPE_BADGE: Record<string, 'success' | 'danger' | 'purple' | 'info' | 'warning'> = {
  asset: 'success',
  liability: 'danger',
  equity: 'purple',
  revenue: 'info',
  expense: 'warning',
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
  const [page, setPage] = useState(1)
  const canCreate = useCan('accounting', 'create')

  const filterSignature = JSON.stringify(filters.params)
  useEffect(() => {
    setPage(1)
  }, [filterSignature])

  const { data, results, total, isFetching } = usePagedList<Account>({
    keyFor: (p) => qk.accounts.list({ ...filters.params, page: p }),
    fetchPage: (p) =>
      accountsApi.list(filtersToQuery(filters.params, { page: p })).then((r) => r.data as Paginated<Account>),
    page,
    pageSize: PAGE_SIZE,
  })
  const isRefreshing = isFetching && !!data

  const prefetchAccount = usePrefetchDetail<Account>(
    (a) => qk.accounts.detail(a.id),
    (a) => accountsApi.get(a.id).then((r) => r.data)
  )

  const columns: Column<Account>[] = [
    { key: 'code', header: 'Code', render: (a) => <span className="font-mono text-primary-600 dark:text-primary-400">{a.code}</span> },
    {
      key: 'name',
      header: 'Name',
      render: (a) => (
        <span>
          {a.name}
          {a.is_system && <Badge variant="secondary" className="ml-2">system</Badge>}
          {!a.is_active && <Badge variant="danger" className="ml-2">inactive</Badge>}
        </span>
      ),
    },
    {
      key: 'account_type',
      header: 'Type',
      render: (a) => (
        <Badge variant={TYPE_BADGE[a.account_type] ?? 'default'}>{TYPE_LABELS[a.account_type] ?? a.account_type}</Badge>
      ),
    },
    { key: 'currency', header: 'Ccy', render: (a) => a.currency || '—' },
    {
      key: 'current_balance',
      header: 'Balance',
      align: 'right',
      render: (a) => (
        <span className="tabular-nums">
          <CurrencyDisplay amount={parseFloat(a.current_balance)} currency="USD" />
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chart of Accounts"
        description="Range-locked account codes; balances update in real time as documents post"
        icon={BookOpen}
        actions={
          canCreate ? (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-2" /> New Account
            </Button>
          ) : undefined
        }
      />

      <FilterBar config={FILTER_CONFIG} filters={filters} />

      <div className="relative">
        <RefreshingOverlay active={isRefreshing} />
        <div className={refreshingContentClass(isRefreshing)}>
          <DataTable<Account>
            rowKey={(a) => a.id}
            columns={columns}
            data={results}
            loading={!data}
            onRowClick={(a) => navigate(`/app/accounts/${a.id}`)}
            onRowHover={prefetchAccount}
            emptyTitle="No accounts found"
            emptyDescription="No accounts match the current filters."
            pagination={{
              page,
              pageSize: PAGE_SIZE,
              total,
              onPageChange: setPage,
            }}
          />
        </div>
      </div>

      <AccountFormModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}
