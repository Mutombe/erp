import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PencilSimple, Plus, Users } from '@phosphor-icons/react'
import { guardiansApi } from '@/services/api'
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
  refreshingContentClass,
  type Column,
} from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import type { Guardian } from '@/types/students'
import GuardianFormModal from './GuardianFormModal'

const PAGE_SIZE = 25

const FILTER_CONFIG: FilterConfig = [
  { type: 'search', placeholder: 'Search code, name, phone…' },
  { type: 'dateRange', field: 'created_at', label: 'Created' },
]

export default function Guardians() {
  const navigate = useNavigate()
  const filters = useUrlFilters(FILTER_CONFIG)
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Guardian | null>(null)
  const canCreate = useCan('students', 'create')
  const canEdit = useCan('students', 'edit')

  const filterSignature = JSON.stringify(filters.params)
  useEffect(() => {
    setPage(1)
  }, [filterSignature])

  const { data, results, total, isFetching } = usePagedList<Guardian>({
    keyFor: (p) => qk.guardians.list({ ...filters.params, page: p }),
    fetchPage: (p) =>
      guardiansApi.list(filtersToQuery(filters.params, { page: p })).then((r) => r.data as Paginated<Guardian>),
    page,
    pageSize: PAGE_SIZE,
  })
  const isRefreshing = isFetching && !!data

  // Warm the guardian detail cache on row hover so opening a guardian is instant.
  const prefetchGuardian = usePrefetchDetail<Guardian>(
    (g) => qk.guardians.detail(g.id),
    (g) => guardiansApi.get(g.id).then((r) => r.data)
  )

  const columns: Column<Guardian>[] = [
    {
      key: 'code',
      header: 'Code',
      render: (g) => <span className="font-mono text-primary-600 dark:text-primary-400">{g.code}</span>,
    },
    { key: 'full_name', header: 'Name', render: (g) => <span className="font-medium">{g.full_name}</span> },
    { key: 'phone', header: 'Phone', render: (g) => g.phone || '—' },
    { key: 'email', header: 'Email', render: (g) => g.email || '—' },
    {
      key: 'students',
      header: 'Students',
      align: 'right',
      render: (g) => <span className="tabular-nums">{(g.students ?? []).length}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (g) =>
        canEdit ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setEditing(g)
              setModalOpen(true)
            }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-gray-800"
            title="Edit guardian"
          >
            <PencilSimple className="w-4 h-4" />
          </button>
        ) : null,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Guardians"
        description="Parents and guardians — billing contacts for student accounts"
        icon={Users}
        actions={
          canCreate ? (
            <Button onClick={() => { setEditing(null); setModalOpen(true) }}>
              <Plus className="w-4 h-4 mr-2" /> New Guardian
            </Button>
          ) : undefined
        }
      />

      <FilterBar config={FILTER_CONFIG} filters={filters} />

      <div className="relative">
        <RefreshingOverlay active={isRefreshing} />
        <div className={refreshingContentClass(isRefreshing)}>
          <DataTable<Guardian>
            rowKey={(g) => g.id}
            columns={columns}
            data={results}
            loading={!data}
            onRowClick={(g) => navigate(`/app/guardians/${g.id}`)}
            onRowHover={prefetchGuardian}
            emptyTitle="No guardians found"
            emptyDescription="No guardians match the current filters."
            pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
          />
        </div>
      </div>

      <GuardianFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        guardian={editing}
      />
    </div>
  )
}
