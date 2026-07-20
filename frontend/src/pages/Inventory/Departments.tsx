import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Buildings, PencilSimple, Plus, Trash } from '@phosphor-icons/react'
import { departmentsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { useDebounce } from '@/lib/utils'
import { useOptimisticDelete } from '@/hooks/useOptimisticMutation'
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  PageHeader,
  RefreshingOverlay,
  refreshingContentClass,
  type Column,
} from '@/components/ui'
import type { Department } from '@/types/inventory'
import DepartmentFormModal from './DepartmentFormModal'

type ActiveFilter = '' | 'true' | 'false'

const FILTERS: [ActiveFilter, string][] = [
  ['', 'All'],
  ['true', 'Active'],
  ['false', 'Inactive'],
]

export default function Departments() {
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editDepartment, setEditDepartment] = useState<Department | null>(null)
  const [toDelete, setToDelete] = useState<Department | null>(null)
  const debouncedSearch = useDebounce(search, 300)

  const { data, isFetching } = useQuery({
    queryKey: qk.departments.list({ search: debouncedSearch, is_active: activeFilter }),
    queryFn: () =>
      departmentsApi
        .list({
          search: debouncedSearch || undefined,
          is_active: activeFilter || undefined,
        })
        .then((r) => r.data as Department[]),
    placeholderData: keepPreviousData,
  })

  const isRefreshing = isFetching && !!data

  // Optimistic: the row disappears at once and is restored on error. A 409 from
  // a department that already has stock moves comes back as { detail }, which
  // parseApiError surfaces in place of the generic errorMessage.
  const deleteMutation = useOptimisticDelete<Department>({
    mutationFn: (id) => departmentsApi.delete(id),
    queryKeyPrefixes: [qk.departments.all],
    successMessage: 'Department deleted',
    errorMessage: 'Failed to delete department',
  })

  const handleDelete = (id: number) => {
    setToDelete(null)
    deleteMutation.mutate(id)
  }

  const columns: Column<Department>[] = [
    {
      key: 'code',
      header: 'Code',
      render: (d) => <span className="font-mono text-primary-600 dark:text-primary-400">{d.code}</span>,
    },
    { key: 'name', header: 'Name' },
    { key: 'head_name', header: 'Head', render: (d) => d.head_name || '—' },
    {
      key: 'expense_account',
      header: 'Expense account',
      render: (d) =>
        d.expense_account ? (
          <span>
            <span className="font-mono text-xs mr-1.5 text-gray-400">{d.expense_account_code}</span>
            {d.expense_account_name}
          </span>
        ) : (
          <span className="text-gray-400">— uses item category default</span>
        ),
    },
    {
      key: 'stock_move_count',
      header: 'Stock issues',
      align: 'right',
      render: (d) => <span className="tabular-nums">{d.stock_move_count}</span>,
    },
    {
      key: 'is_active',
      header: 'Status',
      render: (d) => (
        <Badge variant={d.is_active ? 'success' : 'default'} dot>
          {d.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (d) => (
        <span className="inline-flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setEditDepartment(d)
              setModalOpen(true)
            }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label={`Edit ${d.code}`}
          >
            <PencilSimple className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setToDelete(d)
            }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label={`Delete ${d.code}`}
          >
            <Trash className="w-4 h-4" />
          </button>
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Departments"
        description="Who consumes the stock — the cost dimension behind every issue"
        icon={Buildings}
        actions={
          <Button
            onClick={() => {
              setEditDepartment(null)
              setModalOpen(true)
            }}
          >
            <Plus className="w-4 h-4 mr-2" /> New Department
          </Button>
        }
      />

      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-3xl">
        Departments are the consumption dimension for stock issues: every issue can be tagged with
        the department that used the stock, which is what the Department Consumption report totals
        by. When a department has its own expense account, issues to it debit that account instead
        of the item category default.
      </p>

      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(([value, label]) => (
          <button
            key={value}
            onClick={() => setActiveFilter(value)}
            className={`px-3 py-1.5 text-sm rounded-full border ${
              activeFilter === value
                ? 'bg-primary-600 text-white border-primary-600'
                : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="relative">
        <RefreshingOverlay active={isRefreshing} />
        <div className={refreshingContentClass(isRefreshing)}>
          <DataTable<Department>
            rowKey={(d) => d.id}
            columns={columns}
            data={data ?? []}
            loading={!data}
            searchable
            searchValue={search}
            onSearch={setSearch}
            searchPlaceholder="Search code, name, head…"
            emptyTitle="No departments"
            emptyDescription="Create a department to start tagging stock issues by consumer."
          />
        </div>
      </div>

      <DepartmentFormModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setEditDepartment(null)
        }}
        department={editDepartment}
      />

      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && handleDelete(toDelete.id)}
        title="Delete department?"
        message={
          toDelete
            ? `${toDelete.code} · ${toDelete.name} will be removed. Departments that have already been issued stock cannot be deleted — deactivate them instead.`
            : ''
        }
        confirmText="Delete"
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
