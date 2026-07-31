import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TrendDown, Warning } from '@phosphor-icons/react'
import { itemsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { usePagedList } from '@/hooks/usePaginatedQuery'
import { usePrefetchDetail } from '@/hooks/usePrefetch'
import RecordLink from '@/components/RecordLink'
import { useUrlFilters, filtersToQuery, type FilterConfig } from '@/hooks/useUrlFilters'
import {
  Badge,
  DataTable,
  FilterBar,
  PageHeader,
  RefreshingOverlay,
  StatsCard,
  refreshingContentClass,
  type Column,
} from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import type { Item } from '@/types/inventory'
import { money } from '@/types/procurement'

const PAGE_SIZE = 25

const FILTER_CONFIG: FilterConfig = [
  { type: 'search', placeholder: 'Search code, name, barcode…' },
]

export default function LowStock() {
  const navigate = useNavigate()
  const filters = useUrlFilters(FILTER_CONFIG)
  const [page, setPage] = useState(1)

  const filterSignature = JSON.stringify(filters.params)
  useEffect(() => {
    setPage(1)
  }, [filterSignature])

  const { data, results, total, isFetching } = usePagedList<Item>({
    keyFor: (p) => qk.items.list({ report: 'low-stock', ...filters.params, page: p }),
    fetchPage: (p) => itemsApi.lowStock(filtersToQuery(filters.params, { page: p })).then((r) => r.data as Paginated<Item>),
    page,
    pageSize: PAGE_SIZE,
  })
  const isRefreshing = isFetching && !!data

  const prefetchItem = usePrefetchDetail<Item>(
    (i) => qk.items.detail(i.id),
    (i) => itemsApi.get(i.id).then((r) => r.data)
  )

  const columns: Column<Item>[] = [
    {
      key: 'code',
      header: 'Code',
      render: (i) => <RecordLink to={`/app/items/${i.id}`} mono>{i.code}</RecordLink>,
    },
    { key: 'name', header: 'Name' },
    { key: 'category_name', header: 'Category', render: (i) => i.category_name || '—' },
    {
      key: 'qty_on_hand',
      header: 'On hand',
      align: 'right',
      render: (i) => <span className="tabular-nums">{money(i.qty_on_hand)}</span>,
    },
    {
      key: 'reorder_level',
      header: 'Reorder level',
      align: 'right',
      render: (i) => <span className="tabular-nums text-gray-500 dark:text-gray-400">{money(i.reorder_level)}</span>,
    },
    {
      key: 'suggested_order_qty',
      header: 'Suggested order',
      align: 'right',
      render: (i) => (
        <span className="tabular-nums font-semibold text-primary-600 dark:text-primary-400">
          {money(i.suggested_order_qty)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      render: (i) => {
        const out = parseFloat(i.qty_on_hand) <= 0
        return (
          <Badge variant={out ? 'danger' : 'warning'} size="sm">
            {out ? 'Out of stock' : 'Low'}
          </Badge>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reorder / Low Stock"
        description="Active items at or below their reorder level, with a suggested order quantity"
        icon={TrendDown}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatsCard
          title="Items to reorder"
          value={data ? total : '—'}
          subtitle="At or below reorder level"
          icon={Warning}
          color={total > 0 ? 'red' : 'green'}
        />
      </div>

      <FilterBar config={FILTER_CONFIG} filters={filters} />

      <div className="relative">
        <RefreshingOverlay active={isRefreshing} />
        <div className={refreshingContentClass(isRefreshing)}>
          <DataTable<Item>
            rowKey={(i) => i.id}
            columns={columns}
            data={results}
            loading={!data}
            onRowClick={(i) => navigate(`/app/items/${i.id}`)}
            onRowHover={prefetchItem}
            emptyTitle="Nothing to reorder"
            emptyDescription="Everything is above its reorder level."
            pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
          />
        </div>
      </div>
    </div>
  )
}
