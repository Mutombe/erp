import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowsLeftRight } from '@phosphor-icons/react'
import { departmentsApi, itemsApi, stockMovesApi, warehousesApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { usePagedList } from '@/hooks/usePaginatedQuery'
import { useUrlFilters, filtersToQuery, type FilterConfig } from '@/hooks/useUrlFilters'
import {
  Badge,
  DataTable,
  FilterBar,
  PageHeader,
  RefreshingOverlay,
  refreshingContentClass,
  type Column,
} from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import {
  MOVE_TYPE_LABELS,
  MOVE_TYPE_VARIANTS,
  type MoveType,
  type StockMove,
} from '@/types/inventory'
import { money } from '@/types/procurement'

const PAGE_SIZE = 25

const MOVE_TYPES: MoveType[] = ['receipt', 'issue', 'transfer', 'adjustment_in', 'adjustment_out']

const MOVE_TYPE_OPTIONS = MOVE_TYPES.map((t) => ({ value: t, label: MOVE_TYPE_LABELS[t] }))

const FILTER_CONFIG: FilterConfig = [
  { type: 'search', placeholder: 'Search number, item, department…' },
  { type: 'chips', field: 'move_type', label: 'Type', multi: true, options: MOVE_TYPE_OPTIONS },
  {
    type: 'select',
    field: 'item',
    label: 'Item',
    searchable: true,
    query: {
      queryKey: ['items', 'facet-options'],
      queryFn: () => itemsApi.list({ page_size: 500 }).then((r) => (r.data.results ?? r.data) as any[]),
      toOption: (row) => ({ value: String(row.id), label: `${row.code} · ${row.name}` }),
    },
  },
  {
    type: 'select',
    field: 'department',
    label: 'Department',
    searchable: true,
    query: {
      queryKey: ['departments', 'facet-options'],
      queryFn: () => departmentsApi.list({ page_size: 500 }).then((r) => (r.data.results ?? r.data) as any[]),
      toOption: (row) => ({ value: String(row.id), label: `${row.code} · ${row.name}` }),
    },
  },
  {
    type: 'select',
    field: 'warehouse_from',
    label: 'From warehouse',
    searchable: true,
    query: {
      queryKey: ['warehouses', 'facet-options'],
      queryFn: () => warehousesApi.list({ page_size: 500 }).then((r) => (r.data.results ?? r.data) as any[]),
      toOption: (row) => ({ value: String(row.id), label: `${row.code} · ${row.name}` }),
    },
  },
  {
    type: 'select',
    field: 'warehouse_to',
    label: 'To warehouse',
    searchable: true,
    query: {
      queryKey: ['warehouses', 'facet-options'],
      queryFn: () => warehousesApi.list({ page_size: 500 }).then((r) => (r.data.results ?? r.data) as any[]),
      toOption: (row) => ({ value: String(row.id), label: `${row.code} · ${row.name}` }),
    },
  },
  { type: 'dateRange', field: 'date', label: 'Date' },
  { type: 'amountRange', field: 'total_cost_base', label: 'Total (base)' },
]

export default function StockMoves() {
  const filters = useUrlFilters(FILTER_CONFIG)
  const [page, setPage] = useState(1)

  const filterSignature = JSON.stringify(filters.params)
  useEffect(() => {
    setPage(1)
  }, [filterSignature])

  const { data, results, total, isFetching } = usePagedList<StockMove>({
    keyFor: (p) => qk.stockMoves.list({ ...filters.params, page: p }),
    fetchPage: (p) =>
      stockMovesApi.list(filtersToQuery(filters.params, { page: p })).then((r) => r.data as Paginated<StockMove>),
    page,
    pageSize: PAGE_SIZE,
  })
  const isRefreshing = isFetching && !!data

  const columns: Column<StockMove>[] = [
    { key: 'number', header: 'Number', render: (m) => <span className="font-mono">{m.number}</span> },
    { key: 'date', header: 'Date' },
    {
      key: 'move_type',
      header: 'Type',
      render: (m) => <Badge variant={MOVE_TYPE_VARIANTS[m.move_type]} size="sm">{MOVE_TYPE_LABELS[m.move_type]}</Badge>,
    },
    {
      key: 'item',
      header: 'Item',
      render: (m) => (
        <Link
          to={`/app/items/${m.item}`}
          onClick={(e) => e.stopPropagation()}
          className="text-primary-600 dark:text-primary-400 hover:underline"
        >
          <span className="font-mono">{m.item_code}</span> {m.item_name}
        </Link>
      ),
    },
    { key: 'quantity', header: 'Qty', align: 'right', render: (m) => <span className="tabular-nums">{money(m.quantity)}</span> },
    { key: 'unit_cost', header: 'Unit cost', align: 'right', render: (m) => <span className="tabular-nums">{money(m.unit_cost)}</span> },
    { key: 'total_cost_base', header: 'Total (base)', align: 'right', render: (m) => <span className="tabular-nums">{money(m.total_cost_base)}</span> },
    {
      key: 'route',
      header: 'From → To',
      render: (m) => (
        <span className="font-mono text-xs">{m.warehouse_from_code || '—'} → {m.warehouse_to_code || '—'}</span>
      ),
    },
    { key: 'department', header: 'Department', render: (m) => m.department_name || '—' },
    {
      key: 'journal',
      header: 'Journal',
      render: (m) =>
        m.journal ? (
          <Link
            to={`/app/journals/${m.journal}`}
            onClick={(e) => e.stopPropagation()}
            className="text-primary-600 dark:text-primary-400 hover:underline font-mono"
          >
            {m.journal_number}
          </Link>
        ) : (
          '—'
        ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock Moves"
        description="Every receipt, issue, transfer and adjustment — each with its GL posting"
        icon={ArrowsLeftRight}
      />

      <FilterBar config={FILTER_CONFIG} filters={filters} />

      <div className="relative">
        <RefreshingOverlay active={isRefreshing} />
        <div className={refreshingContentClass(isRefreshing)}>
          <DataTable<StockMove>
            rowKey={(m) => m.id}
            columns={columns}
            data={results}
            loading={!data}
            emptyTitle="No stock moves"
            pagination={{
              page,
              pageSize: PAGE_SIZE,
              total,
              onPageChange: setPage,
            }}
          />
        </div>
      </div>
    </div>
  )
}
