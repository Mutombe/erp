import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowsLeftRight } from '@phosphor-icons/react'
import { stockMovesApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { useDebounce } from '@/lib/utils'
import { Badge, DataTable, PageHeader, type Column } from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import { MOVE_TYPE_LABELS, MOVE_TYPE_VARIANTS, type MoveType, type StockMove } from '@/types/inventory'
import { money } from '@/types/procurement'

const MOVE_TYPES: MoveType[] = ['receipt', 'issue', 'transfer', 'adjustment_in', 'adjustment_out']

export default function StockMoves() {
  const [searchParams, setSearchParams] = useSearchParams()
  const typeFilter = searchParams.get('move_type') ?? ''
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search, 300)

  const { data, isLoading } = useQuery({
    queryKey: qk.stockMoves.list({ page, search: debouncedSearch, move_type: typeFilter }),
    queryFn: () =>
      stockMovesApi
        .list({ page, search: debouncedSearch || undefined, move_type: typeFilter || undefined })
        .then((r) => r.data as Paginated<StockMove>),
    placeholderData: keepPreviousData,
  })

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
    { key: 'department', header: 'Department', render: (m) => m.department || '—' },
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

      <div className="flex gap-2 flex-wrap">
        {['', ...MOVE_TYPES].map((t) => (
          <button
            key={t}
            onClick={() => {
              const next = new URLSearchParams(searchParams)
              if (t) next.set('move_type', t)
              else next.delete('move_type')
              setSearchParams(next, { replace: true })
              setPage(1)
            }}
            className={`px-3 py-1.5 text-sm rounded-full border ${
              typeFilter === t
                ? 'bg-primary-600 text-white border-primary-600'
                : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            {t ? MOVE_TYPE_LABELS[t as MoveType] : 'All'}
          </button>
        ))}
      </div>

      <DataTable<StockMove>
        rowKey={(m) => m.id}
        columns={columns}
        data={data?.results ?? []}
        loading={isLoading}
        searchable
        searchValue={search}
        onSearch={(q) => { setSearch(q); setPage(1) }}
        searchPlaceholder="Search number, item, department…"
        emptyTitle="No stock moves"
        pagination={{
          page,
          pageSize: 25,
          total: data?.count ?? 0,
          onPageChange: setPage,
        }}
      />
    </div>
  )
}
