import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Chalkboard } from '@phosphor-icons/react'
import { classesApi, subjectsApi, teachersApi } from '@/services/api'
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
  StatusBadge,
  refreshingContentClass,
  type Column,
} from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import type { Teacher } from '@/types/students'
import TeacherFormModal from './TeacherFormModal'

const PAGE_SIZE = 25

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'on_leave', label: 'On leave' },
]

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
]

const FILTER_CONFIG: FilterConfig = [
  { type: 'search', placeholder: 'Search name, code, email…' },
  { type: 'chips', field: 'status', label: 'Status', options: STATUS_OPTIONS },
  { type: 'select', field: 'gender', label: 'Gender', options: GENDER_OPTIONS },
  {
    type: 'select',
    field: 'subject',
    label: 'Subject',
    searchable: true,
    query: {
      queryKey: ['subjects', 'facet-options'],
      queryFn: () => subjectsApi.list({ page_size: 500 }).then((r) => (r.data.results ?? r.data) as any[]),
      toOption: (row) => ({ value: String(row.id), label: row.name }),
    },
  },
  {
    type: 'select',
    field: 'class_room',
    label: 'Class',
    searchable: true,
    query: {
      queryKey: ['classes', 'facet-options'],
      queryFn: () => classesApi.list({ page_size: 500 }).then((r) => (r.data.results ?? r.data) as any[]),
      toOption: (row) => ({ value: String(row.id), label: row.name }),
    },
  },
]

export default function Teachers() {
  const navigate = useNavigate()
  const filters = useUrlFilters(FILTER_CONFIG)
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const canCreate = useCan('students', 'create')

  const filterSignature = JSON.stringify(filters.params)
  useEffect(() => {
    setPage(1)
  }, [filterSignature])

  const { data, results, total, isFetching } = usePagedList<Teacher>({
    keyFor: (p) => qk.teachers.list({ ...filters.params, page: p }),
    fetchPage: (p) =>
      teachersApi.list(filtersToQuery(filters.params, { page: p })).then((r) => r.data as Paginated<Teacher>),
    page,
    pageSize: PAGE_SIZE,
  })
  const isRefreshing = isFetching && !!data

  const prefetchTeacher = usePrefetchDetail<Teacher>(
    (t) => qk.teachers.detail(t.id),
    (t) => teachersApi.get(t.id).then((r) => r.data)
  )

  const columns: Column<Teacher>[] = [
    { key: 'code', header: 'Code', render: (t) => <span className="font-mono text-primary-600 dark:text-primary-400">{t.code}</span> },
    { key: 'full_name', header: 'Name', render: (t) => <span className="font-medium">{t.full_name}</span> },
    { key: 'status', header: 'Status', render: (t) => <StatusBadge status={t.status} /> },
    { key: 'class_count', header: 'Classes', align: 'right', render: (t) => <span className="tabular-nums">{t.class_count}</span> },
    { key: 'student_count', header: 'Students', align: 'right', render: (t) => <span className="tabular-nums">{t.student_count}</span> },
    {
      key: 'contact',
      header: 'Contact',
      render: (t) => (
        <span className="text-gray-600 dark:text-slate-400">
          {t.phone || t.email || '—'}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teachers"
        description="Teaching staff, their classes and subjects"
        icon={Chalkboard}
        actions={
          canCreate ? (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-2" /> New Teacher
            </Button>
          ) : undefined
        }
      />

      <FilterBar config={FILTER_CONFIG} filters={filters} />

      <div className="relative">
        <RefreshingOverlay active={isRefreshing} />
        <div className={refreshingContentClass(isRefreshing)}>
          <DataTable<Teacher>
            rowKey={(t) => t.id}
            columns={columns}
            data={results}
            loading={!data}
            onRowClick={(t) => navigate(`/app/teachers/${t.id}`)}
            onRowHover={prefetchTeacher}
            emptyTitle="No teachers found"
            emptyDescription="No teachers match the current filters."
            pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
          />
        </div>
      </div>

      <TeacherFormModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}
