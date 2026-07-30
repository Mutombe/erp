import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { ArrowsLeftRight, Package, CurrencyDollar, Wallet } from '@phosphor-icons/react'
import { stockMovesApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import RecordLink from '@/components/RecordLink'
import { Badge, PageHeader, SkeletonCard, StatsCard } from '@/components/ui'
import { sourceDocPath } from '@/types/accounting'
import { MOVE_TYPE_LABELS, MOVE_TYPE_VARIANTS, type StockMove } from '@/types/inventory'
import { money } from '@/types/procurement'

export default function StockMoveDetail() {
  const { id } = useParams()

  const { data: move } = useQuery({
    queryKey: qk.stockMoves.detail(id!),
    queryFn: () => stockMovesApi.get(id!).then((r) => r.data as StockMove),
  })

  if (!move) return <SkeletonCard />

  const docPath = sourceDocPath(move.source_type, move.source_id)

  return (
    <div className="space-y-6">
      <PageHeader
        title={move.number}
        description={`${MOVE_TYPE_LABELS[move.move_type]} · ${move.date}`}
        icon={ArrowsLeftRight}
        backLink="/app/stock-moves"
        actions={<Badge variant={MOVE_TYPE_VARIANTS[move.move_type]}>{MOVE_TYPE_LABELS[move.move_type]}</Badge>}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatsCard title="Quantity" value={money(move.quantity)} subtitle={`per unit ${money(move.unit_cost)}`} icon={Package} color="blue" />
        <StatsCard title="Unit cost (base)" value={money(move.unit_cost)} subtitle="Moving average at time of move" icon={CurrencyDollar} color="purple" />
        <StatsCard title="Total (base)" value={money(move.total_cost_base)} subtitle="qty × unit cost" icon={Wallet} color="green" />
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <span className="text-gray-500 block">Item</span>
          <RecordLink to={`/app/items/${move.item}`} mono>
            {move.item_code}
          </RecordLink>{' '}
          <span>{move.item_name}</span>
        </div>
        <div>
          <span className="text-gray-500 block">From warehouse</span>
          {move.warehouse_from ? (
            <RecordLink to={`/app/warehouses/${move.warehouse_from}`} mono>
              {move.warehouse_from_code}
            </RecordLink>
          ) : (
            '—'
          )}
        </div>
        <div>
          <span className="text-gray-500 block">To warehouse</span>
          {move.warehouse_to ? (
            <RecordLink to={`/app/warehouses/${move.warehouse_to}`} mono>
              {move.warehouse_to_code}
            </RecordLink>
          ) : (
            '—'
          )}
        </div>
        <div>
          <span className="text-gray-500 block">Department</span>
          {move.department ? (
            <RecordLink to={`/app/departments/${move.department}`}>
              {move.department_code ? `${move.department_code} · ` : ''}
              {move.department_name}
            </RecordLink>
          ) : (
            '—'
          )}
        </div>
        <div><span className="text-gray-500 block">Date</span>{move.date}</div>
        <div><span className="text-gray-500 block">Status</span><span className="capitalize">{move.status}</span></div>
        <div>
          <span className="text-gray-500 block">Journal</span>
          {move.journal ? (
            <RecordLink to={`/app/journals/${move.journal}`} mono>
              {move.journal_number ?? `#${move.journal}`}
            </RecordLink>
          ) : (
            '—'
          )}
        </div>
        <div>
          <span className="text-gray-500 block">Source document</span>
          {docPath ? (
            <RecordLink to={docPath}>{move.source_type || 'View source'}</RecordLink>
          ) : (
            '—'
          )}
        </div>
        {move.reason && (
          <div className="col-span-2 md:col-span-4">
            <span className="text-gray-500 block">Reason</span>
            {move.reason}
          </div>
        )}
      </div>
    </div>
  )
}
