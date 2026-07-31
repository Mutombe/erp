import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { TreeStructure, Bank, Plus, TrendDown, Wallet } from '@phosphor-icons/react'
import { assetCategoriesApi, assetsApi, reportsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { usePagedList } from '@/hooks/usePaginatedQuery'
import { usePrefetchDetail } from '@/hooks/usePrefetch'
import { useUrlFilters, filtersToQuery, type FilterConfig } from '@/hooks/useUrlFilters'
import { useCan } from '@/hooks/useCan'
import {
  Button,
  DataTable,
  FilterBar,
  PageHeader,
  RefreshingOverlay,
  StatsCard,
  StatusBadge,
  refreshingContentClass,
  type Column,
} from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import { ASSET_STATUS_LABELS, type Asset, type AssetRegisterData } from '@/types/assets'
import AssetFormModal from './AssetFormModal'
import CategoryFormModal from './CategoryFormModal'
import DepreciationPanel from './DepreciationPanel'

const money = (v: string | number | null | undefined) =>
  Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const PAGE_SIZE = 25

// Static (stable identity — defined at module scope so filter hooks don't churn).
const STATUS_OPTIONS = (['draft', 'active', 'fully_depreciated', 'disposed', 'written_off'] as const).map(
  (value) => ({ value, label: ASSET_STATUS_LABELS[value] })
)

const FILTER_CONFIG: FilterConfig = [
  { type: 'search', placeholder: 'Search code, name, serial, location, custodian…' },
  { type: 'chips', field: 'status', label: 'Status', multi: true, options: STATUS_OPTIONS },
  {
    type: 'select',
    field: 'category',
    label: 'Category',
    searchable: true,
    query: {
      queryKey: ['assetCategories', 'facet-options'],
      queryFn: () => assetCategoriesApi.list({ page_size: 500 }).then((r) => (r.data.results ?? r.data) as any[]),
      toOption: (row) => ({ value: String(row.id), label: `${row.code} · ${row.name}` }),
    },
  },
  { type: 'dateRange', field: 'acquisition_date', label: 'Acquired' },
  { type: 'amountRange', field: 'cost_base', label: 'Cost' },
]

export default function FixedAssets() {
  const navigate = useNavigate()
  const canCreate = useCan('assets', 'create')
  const filters = useUrlFilters(FILTER_CONFIG)
  const [page, setPage] = useState(1)
  const [showAssetModal, setShowAssetModal] = useState(false)
  const [showCategoryModal, setShowCategoryModal] = useState(false)

  // Any filter change returns to page 1 (keepPreviousData keeps the old rows on
  // screen so this never blanks the table).
  const filterSignature = JSON.stringify(filters.params)
  useEffect(() => {
    setPage(1)
  }, [filterSignature])

  const { data, results, total, isFetching } = usePagedList<Asset>({
    keyFor: (p) => qk.assets.list({ ...filters.params, page: p }),
    fetchPage: (p) =>
      assetsApi.list(filtersToQuery(filters.params, { page: p })).then((r) => r.data as Paginated<Asset>),
    page,
    pageSize: PAGE_SIZE,
  })
  const isRefreshing = isFetching && !!data

  // Warm the asset detail cache on row hover so opening an asset is instant.
  const prefetchAsset = usePrefetchDetail<Asset>(
    (a) => qk.assets.detail(a.id),
    (a) => assetsApi.get(a.id).then((r) => r.data)
  )

  const { data: register } = useQuery({
    queryKey: qk.reports.assetRegister(),
    queryFn: () => reportsApi.assetRegister().then((r) => r.data as AssetRegisterData),
  })

  // Stat cards skeleton on first paint only — a depreciation run refetches them in place.
  const registerLoading = !register

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
            {canCreate && (
              <Button variant="outline" onClick={() => setShowCategoryModal(true)}>
                <TreeStructure className="w-4 h-4 mr-2" /> New Category
              </Button>
            )}
            {canCreate && (
              <Button onClick={() => setShowAssetModal(true)}>
                <Plus className="w-4 h-4 mr-2" /> New Asset
              </Button>
            )}
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

      <FilterBar config={FILTER_CONFIG} filters={filters} />

      <div className="relative">
        <RefreshingOverlay active={isRefreshing} />
        <div className={refreshingContentClass(isRefreshing)}>
          <DataTable<Asset>
            rowKey={(a) => a.id}
            columns={columns}
            data={results}
            loading={!data}
            onRowClick={(a) => navigate(`/app/fixed-assets/${a.id}`)}
            onRowHover={prefetchAsset}
            emptyTitle="No assets found"
            emptyDescription="Register your first asset — it will be capitalized automatically."
            pagination={{
              page,
              pageSize: PAGE_SIZE,
              total,
              onPageChange: setPage,
            }}
          />
        </div>
      </div>

      <DepreciationPanel />

      <AssetFormModal open={showAssetModal} onClose={() => setShowAssetModal(false)} />
      <CategoryFormModal open={showCategoryModal} onClose={() => setShowCategoryModal(false)} />
    </div>
  )
}
