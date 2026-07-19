import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { TreeStructure, Bank, Plus, TrendDown, Wallet } from '@phosphor-icons/react'
import { assetsApi, reportsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { useDebounce } from '@/lib/utils'
import { Button, DataTable, PageHeader, StatsCard, StatusBadge, type Column } from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import { ASSET_STATUS_LABELS, type Asset, type AssetRegisterData } from '@/types/assets'
import AssetFormModal from './AssetFormModal'
import CategoryFormModal from './CategoryFormModal'
import DepreciationPanel from './DepreciationPanel'

const money = (v: string | number | null | undefined) =>
  Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const STATUS_FILTERS = ['', 'active', 'fully_depreciated', 'disposed', 'written_off']

export default function FixedAssets() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const statusFilter = searchParams.get('status') ?? ''
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showAssetModal, setShowAssetModal] = useState(false)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const debouncedSearch = useDebounce(search, 300)

  const { data, isLoading } = useQuery({
    queryKey: qk.assets.list({ page, search: debouncedSearch, status: statusFilter }),
    queryFn: () =>
      assetsApi
        .list({ page, search: debouncedSearch || undefined, status: statusFilter || undefined })
        .then((r) => r.data as Paginated<Asset>),
    placeholderData: keepPreviousData,
  })

  const { data: register, isLoading: registerLoading } = useQuery({
    queryKey: qk.reports.assetRegister(),
    queryFn: () => reportsApi.assetRegister().then((r) => r.data as AssetRegisterData),
  })

  const columns: Column<Asset>[] = [
    { key: 'code', header: 'Code', render: (a) => <span className="font-mono text-primary-600 dark:text-primary-400">{a.code}</span> },
    { key: 'name', header: 'Name', render: (a) => <span className="block max-w-xs truncate font-medium">{a.name}</span> },
    { key: 'category_name', header: 'Category' },
    { key: 'acquisition_date', header: 'Acquired' },
    { key: 'cost_base', header: 'Cost', align: 'right', render: (a) => <span className="tabular-nums">{money(a.cost_base)}</span> },
    { key: 'accumulated_depreciation', header: 'Accum. Depr.', align: 'right', render: (a) => <span className="tabular-nums">{money(a.accumulated_depreciation)}</span> },
    { key: 'net_book_value', header: 'NBV', align: 'right', render: (a) => <span className="tabular-nums font-semibold">{money(a.net_book_value)}</span> },
    { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fixed Assets"
        description="Asset register, capitalization and monthly depreciation"
        icon={Bank}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowCategoryModal(true)}>
              <TreeStructure className="w-4 h-4 mr-2" /> New Category
            </Button>
            <Button onClick={() => setShowAssetModal(true)}>
              <Plus className="w-4 h-4 mr-2" /> New Asset
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatsCard
          title="Total cost"
          value={money(register?.total_cost)}
          subtitle="Base currency, excluding drafts"
          icon={Bank}
          color="blue"
          loading={registerLoading}
        />
        <StatsCard
          title="Accumulated depreciation"
          value={money(register?.total_accumulated)}
          subtitle="Written off to date"
          icon={TrendDown}
          color="orange"
          loading={registerLoading}
        />
        <StatsCard
          title="Net book value"
          value={money(register?.total_nbv)}
          subtitle="Cost less accumulated depreciation"
          icon={Wallet}
          color="green"
          loading={registerLoading}
        />
      </div>

      <div className="flex gap-2 flex-wrap">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => {
              const next = new URLSearchParams(searchParams)
              if (s) next.set('status', s)
              else next.delete('status')
              setSearchParams(next, { replace: true })
              setPage(1)
            }}
            className={`px-3 py-1.5 text-sm rounded-full border ${
              statusFilter === s
                ? 'bg-primary-600 text-white border-primary-600'
                : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            {s ? ASSET_STATUS_LABELS[s] ?? s : 'All'}
          </button>
        ))}
      </div>

      <DataTable<Asset>
        rowKey={(a) => a.id}
        columns={columns}
        data={data?.results ?? []}
        loading={isLoading}
        searchable
        searchValue={search}
        onSearch={(q) => { setSearch(q); setPage(1) }}
        searchPlaceholder="Search code, name, serial, location, custodian…"
        onRowClick={(a) => navigate(`/app/fixed-assets/${a.id}`)}
        emptyTitle="No assets found"
        emptyDescription="Register your first asset — it will be capitalized automatically."
        pagination={{
          page,
          pageSize: 25,
          total: data?.count ?? 0,
          onPageChange: setPage,
        }}
      />

      <DepreciationPanel />

      <AssetFormModal open={showAssetModal} onClose={() => setShowAssetModal(false)} />
      <CategoryFormModal open={showCategoryModal} onClose={() => setShowCategoryModal(false)} />
    </div>
  )
}
