import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { PencilSimple, Plus, Users } from '@phosphor-icons/react'
import { guardiansApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { useDebounce } from '@/lib/utils'
import { Button, DataTable, PageHeader, type Column } from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import type { Guardian } from '@/types/students'
import GuardianFormModal from './GuardianFormModal'

export default function Guardians() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Guardian | null>(null)
  const debouncedSearch = useDebounce(search, 300)

  const { data, isLoading } = useQuery({
    queryKey: qk.guardians.list({ page, search: debouncedSearch }),
    queryFn: () =>
      guardiansApi
        .list({ page, search: debouncedSearch || undefined })
        .then((r) => r.data as Paginated<Guardian>),
    placeholderData: keepPreviousData,
  })

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
      render: (g) => (
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
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Guardians"
        description="Parents and guardians — billing contacts for student accounts"
        icon={Users}
        actions={
          <Button onClick={() => { setEditing(null); setModalOpen(true) }}>
            <Plus className="w-4 h-4 mr-2" /> New Guardian
          </Button>
        }
      />

      <DataTable<Guardian>
        rowKey={(g) => g.id}
        columns={columns}
        data={data?.results ?? []}
        loading={isLoading}
        searchable
        searchValue={search}
        onSearch={(q) => { setSearch(q); setPage(1) }}
        searchPlaceholder="Search code, name, phone…"
        onRowClick={(g) => navigate(`/app/guardians/${g.id}`)}
        emptyTitle="No guardians found"
        pagination={{ page, pageSize: 25, total: data?.count ?? 0, onPageChange: setPage }}
      />

      <GuardianFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        guardian={editing}
      />
    </div>
  )
}
