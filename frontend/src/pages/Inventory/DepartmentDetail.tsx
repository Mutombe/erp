import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { UsersFour, ArrowLineUp, Wallet } from '@phosphor-icons/react'
import { departmentsApi, stockMovesApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import RecordLink from '@/components/RecordLink'
import {
  Badge,
  PageHeader,
  RefreshingOverlay,
  SkeletonCard,
  SkeletonTable,
  StatsCard,
  refreshingContentClass,
} from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import { MOVE_TYPE_LABELS, MOVE_TYPE_VARIANTS, type Department, type StockMove } from '@/types/inventory'
import { money } from '@/types/procurement'

export default function DepartmentDetail() {
  const { id } = useParams()

  const { data: department } = useQuery({
    queryKey: qk.departments.detail(id!),
    queryFn: () => departmentsApi.get(id!).then((r) => r.data as Department),
  })

  const { data: moves, isFetching: movesFetching } = useQuery({
    queryKey: qk.stockMoves.list({ department: id, page_size: 500 }),
    queryFn: () =>
      stockMovesApi.list({ department: id, page_size: 500 }).then((r) => r.data as Paginated<StockMove>),
    enabled: !!id,
  })

  if (!department) return <SkeletonCard />

  const rows = moves?.results ?? []
  const consumption = rows.reduce((sum, m) => sum + parseFloat(m.total_cost_base || '0'), 0)
  const movesRefreshing = movesFetching && !!moves

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${department.code} · ${department.name}`}
        description={department.head_name ? `Head: ${department.head_name}` : 'Consumption dimension for stock issues'}
        icon={UsersFour}
        backLink="/app/departments"
        actions={
          <Badge variant={department.is_active ? 'success' : 'default'} dot>
            {department.is_active ? 'Active' : 'Inactive'}
          </Badge>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatsCard
          title="Stock issues"
          value={String(department.stock_move_count)}
          subtitle="Moves tagged to this department"
          icon={ArrowLineUp}
          color="blue"
        />
        <StatsCard
          title="Consumption (base)"
          value={money(consumption)}
          subtitle={moves && rows.length >= 500 ? 'First 500 moves' : 'Total across all moves'}
          icon={Wallet}
          color="green"
        />
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div><span className="text-gray-500 block">Code</span><span className="font-mono">{department.code}</span></div>
        <div><span className="text-gray-500 block">Head</span>{department.head_name || '—'}</div>
        <div className="col-span-2">
          <span className="text-gray-500 block">Expense account</span>
          {department.expense_account ? (
            <RecordLink to={`/app/accounts/${department.expense_account}`}>
              <span className="font-mono mr-1.5">{department.expense_account_code}</span>
              {department.expense_account_name}
            </RecordLink>
          ) : (
            <span className="text-gray-400">— uses item category default</span>
          )}
        </div>
        {department.description && (
          <div className="col-span-2 md:col-span-4">
            <span className="text-gray-500 block">Description</span>
            {department.description}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2 flex items-center gap-2">
          <ArrowLineUp className="w-4 h-4" /> Stock issues
        </h3>
        {!moves ? (
          <SkeletonTable rows={5} />
        ) : (
          <div className="relative">
            <RefreshingOverlay active={movesRefreshing} />
            <div className={refreshingContentClass(movesRefreshing, 'overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700')}>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3">Number</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Total (base)</th>
                    <th className="px-4 py-3">Journal</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-gray-500">No stock issued to this department yet</td>
                    </tr>
                  )}
                  {rows.map((m) => (
                    <tr key={m.id} className="border-t border-gray-100 dark:border-gray-700/50">
                      <td className="px-4 py-2.5">
                        <RecordLink to={`/app/stock-moves/${m.id}`} mono>{m.number}</RecordLink>
                      </td>
                      <td className="px-4 py-2.5">{m.date}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant={MOVE_TYPE_VARIANTS[m.move_type]} size="sm">{MOVE_TYPE_LABELS[m.move_type]}</Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        <RecordLink to={`/app/items/${m.item}`} mono>{m.item_code}</RecordLink>{' '}
                        <span className="text-gray-500">{m.item_name}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{money(m.quantity)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{money(m.total_cost_base)}</td>
                      <td className="px-4 py-2.5">
                        {m.journal ? (
                          <RecordLink to={`/app/journals/${m.journal}`} mono>{m.journal_number}</RecordLink>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
