import { useEffect, useState } from 'react'
import { Stack } from '@phosphor-icons/react'
import { stockLotsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { usePagedList } from '@/hooks/usePaginatedQuery'
import { useUrlFilters, filtersToQuery, type FilterConfig } from '@/hooks/useUrlFilters'
import RecordLink from '@/components/RecordLink'
import {
  Badge,
  DataTable,
  FilterBar,
  Input,
  PageHeader,
  RefreshingOverlay,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  refreshingContentClass,
  type Column,
} from '@/components/ui'
import { formatDate } from '@/lib/utils'
import type { Paginated } from '@/types/accounting'
import { LOT_EXPIRY_WARN_DAYS, daysUntil, type StockLot } from '@/types/inventory'
import { money } from '@/types/procurement'

const PAGE_SIZE = 25

const FILTER_CONFIG: FilterConfig = [
  { type: 'search', placeholder: 'Search lot code, item…' },
]

function ExpiryCell({ lot }: { lot: StockLot }) {
  if (!lot.expiry_date) return <span className="text-gray-400">—</span>
  const days = daysUntil(lot.expiry_date)
  const urgent = days !== null && days <= LOT_EXPIRY_WARN_DAYS
  return (
    <span className="inline-flex items-center gap-2">
      <span className={urgent ? 'font-medium text-red-600 dark:text-red-400' : ''}>
        {formatDate(lot.expiry_date)}
      </span>
      {days !== null && days < 0 && <Badge variant="danger" size="sm">Expired</Badge>}
      {days !== null && days >= 0 && urgent && (
        <Badge variant="warning" size="sm">{days}d</Badge>
      )}
    </span>
  )
}

const columns: Column<StockLot>[] = [
  {
    key: 'item',
    header: 'Item',
    render: (l) => (
      <RecordLink to={`/app/items/${l.item}`}>
        <span className="font-mono">{l.item_code}</span> {l.item_name}
      </RecordLink>
    ),
  },
  {
    key: 'warehouse',
    header: 'Warehouse',
    render: (l) => <RecordLink to={`/app/warehouses/${l.warehouse}`} mono>{l.warehouse_code}</RecordLink>,
  },
  { key: 'lot_code', header: 'Lot code', render: (l) => <span className="font-mono text-xs">{l.lot_code || '—'}</span> },
  { key: 'expiry_date', header: 'Expiry', render: (l) => <ExpiryCell lot={l} /> },
  { key: 'quantity', header: 'Qty', align: 'right', render: (l) => <span className="tabular-nums">{money(l.quantity)}</span> },
  { key: 'received_date', header: 'Received', render: (l) => formatDate(l.received_date) },
]

function AllLotsView() {
  const filters = useUrlFilters(FILTER_CONFIG)
  const [page, setPage] = useState(1)

  const filterSignature = JSON.stringify(filters.params)
  useEffect(() => {
    setPage(1)
  }, [filterSignature])

  const { data, results, total, isFetching } = usePagedList<StockLot>({
    keyFor: (p) => qk.stockLots.list({ view: 'all', ...filters.params, page: p }),
    fetchPage: (p) => stockLotsApi.list(filtersToQuery(filters.params, { page: p })).then((r) => r.data as Paginated<StockLot>),
    page,
    pageSize: PAGE_SIZE,
  })
  const isRefreshing = isFetching && !!data

  return (
    <div className="space-y-4">
      <FilterBar config={FILTER_CONFIG} filters={filters} />
      <div className="relative">
        <RefreshingOverlay active={isRefreshing} />
        <div className={refreshingContentClass(isRefreshing)}>
          <DataTable<StockLot>
            rowKey={(l) => l.id}
            columns={columns}
            data={results}
            loading={!data}
            emptyTitle="No lots on hand"
            emptyDescription="Lot-tracked items create a lot each time stock is received."
            pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
          />
        </div>
      </div>
    </div>
  )
}

function ExpiringView() {
  const filters = useUrlFilters(FILTER_CONFIG)
  const [page, setPage] = useState(1)
  const [before, setBefore] = useState('')

  const signature = JSON.stringify({ ...filters.params, before })
  useEffect(() => {
    setPage(1)
  }, [signature])

  const { data, results, total, isFetching } = usePagedList<StockLot>({
    keyFor: (p) => qk.stockLots.list({ view: 'expiring', before, ...filters.params, page: p }),
    fetchPage: (p) =>
      stockLotsApi
        .expiring(filtersToQuery(filters.params, { before, page: p }))
        .then((r) => r.data as Paginated<StockLot>),
    page,
    pageSize: PAGE_SIZE,
  })
  const isRefreshing = isFetching && !!data

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[240px]">
          <FilterBar config={FILTER_CONFIG} filters={filters} />
        </div>
        <div className="w-full sm:w-56">
          <Input
            type="date"
            label="Expiring on or before"
            value={before}
            onChange={(e) => setBefore(e.target.value)}
          />
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {before ? `Lots expiring on or before ${formatDate(before)}.` : 'Showing lots expiring within the next 90 days.'}
      </p>
      <div className="relative">
        <RefreshingOverlay active={isRefreshing} />
        <div className={refreshingContentClass(isRefreshing)}>
          <DataTable<StockLot>
            rowKey={(l) => l.id}
            columns={columns}
            data={results}
            loading={!data}
            emptyTitle="Nothing expiring"
            emptyDescription="No lots fall within the expiry window."
            pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
          />
        </div>
      </div>
    </div>
  )
}

export default function StockLots() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock Lots & Expiry"
        description="Batches on hand for lot-tracked items, consumed first-expiry-first-out (FEFO)"
        icon={Stack}
      />

      <Tabs defaultValue="all">
        <TabsList className="mb-5">
          <TabsTrigger value="all">All lots</TabsTrigger>
          <TabsTrigger value="expiring">Expiring soon</TabsTrigger>
        </TabsList>
        <TabsContent value="all">
          <AllLotsView />
        </TabsContent>
        <TabsContent value="expiring">
          <ExpiringView />
        </TabsContent>
      </Tabs>
    </div>
  )
}
