import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Plus } from 'lucide-react'
import { accountsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import {
  Accordion,
  Badge,
  Button,
  CurrencyDisplay,
  PageHeader,
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

export default function ChartOfAccounts() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: qk.accounts.list(),
    queryFn: () => accountsApi.list().then((r) => r.data as Account[]),
  })

  const grouped = useMemo(() => {
    const accounts = (data ?? []).filter(
      (a) =>
        !search ||
        a.code.includes(search) ||
        a.name.toLowerCase().includes(search.toLowerCase())
    )
    return TYPE_ORDER.map((type) => ({
      type,
      accounts: accounts.filter((a) => a.account_type === type),
    })).filter((g) => g.accounts.length > 0)
  }, [data, search])

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

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by code or name…"
        className="w-full max-w-sm px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
      />

      {isLoading ? (
        <SkeletonTable rows={10} />
      ) : (
        <div className="space-y-4">
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
      )}

      <AccountFormModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}
