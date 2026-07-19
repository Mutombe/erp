import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { Stack, Warehouse as WarehouseIcon } from '@phosphor-icons/react'
import { itemsApi, stockLevelsApi, warehousesApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { Badge, PageHeader, SkeletonCard, StatsCard } from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import type { Item, StockLevel, Warehouse } from '@/types/inventory'
import { money } from '@/types/procurement'

export default function WarehouseDetail() {
  const { id } = useParams()

  const { data: warehouse, isLoading } = useQuery({
    queryKey: qk.warehouses.detail(id!),
    queryFn: () => warehousesApi.get(id!).then((r) => r.data as Warehouse),
  })

  const { data: levels } = useQuery({
    queryKey: qk.stockLevels.list({ warehouse: id }),
    queryFn: () =>
      stockLevelsApi
        .list({ warehouse: id, page_size: 500 })
        .then((r) => r.data as Paginated<StockLevel>),
    enabled: !!id,
  })

  // Avg costs come from the item master — join client-side for the value column.
  const { data: items } = useQuery({
    queryKey: qk.items.list({ for: 'valuation' }),
    queryFn: () => itemsApi.list({ page_size: 500 }).then((r) => r.data as Paginated<Item>),
  })

  const avgCostByItem = useMemo(() => {
    const map = new Map<number, number>()
    for (const item of items?.results ?? []) map.set(item.id, parseFloat(item.avg_cost))
    return map
  }, [items])

  const rows = (levels?.results ?? []).map((l) => {
    const avgCost = avgCostByItem.get(l.item)
    return { ...l, value: avgCost !== undefined ? parseFloat(l.quantity) * avgCost : null }
  })
  const totalValue = rows.reduce((sum, r) => sum + (r.value ?? 0), 0)

  if (isLoading || !warehouse) return <SkeletonCard />

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${warehouse.code} · ${warehouse.name}`}
        description={warehouse.location || 'No location recorded'}
        icon={WarehouseIcon}
        backLink="/app/warehouses"
        actions={
          <Badge variant={warehouse.is_active ? 'success' : 'default'} dot>
            {warehouse.is_active ? 'Active' : 'Inactive'}
          </Badge>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatsCard title="Line items in stock" value={rows.length} icon={Stack} color="blue" />
        <StatsCard title="Stock value (base)" value={money(totalValue)} subtitle="qty × item avg cost" icon={WarehouseIcon} color="green" />
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Stock on hand</h3>
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3 text-right">Quantity</th>
                <th className="px-4 py-3 text-right">Avg cost</th>
                <th className="px-4 py-3 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-500">Nothing in stock here</td>
                </tr>
              )}
              {rows.map((l) => (
                <tr key={l.id} className="border-t border-gray-100 dark:border-gray-700/50">
                  <td className="px-4 py-2.5">
                    <Link to={`/app/items/${l.item}`} className="text-primary-600 dark:text-primary-400 hover:underline">
                      <span className="font-mono">{l.item_code}</span> {l.item_name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(l.quantity)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {avgCostByItem.has(l.item) ? money(avgCostByItem.get(l.item)!) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{l.value !== null ? money(l.value) : '—'}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold">
                <tr>
                  <td className="px-4 py-3" colSpan={3}>Total value</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(totalValue)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
