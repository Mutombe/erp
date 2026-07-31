import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GraduationCap, Plus } from '@phosphor-icons/react'
import { studentsApi } from '@/services/api'
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
import { STUDENT_STATUSES, ATTENDANCE_TYPES, type Student } from '@/types/students'
import { fmtMoney } from '@/types/fees'
import StudentFormModal from './StudentFormModal'

const PAGE_SIZE = 25

// Static (stable identity — defined at module scope so filter hooks don't churn).
const STATUS_OPTIONS = STUDENT_STATUSES.map((s) => ({
  value: s,
  label: s.charAt(0).toUpperCase() + s.slice(1),
}))

const ATTENDANCE_OPTIONS = ATTENDANCE_TYPES.map(([value, label]) => ({ value, label }))

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
]

const FILTER_CONFIG: FilterConfig = [
  { type: 'search', placeholder: 'Search admission code or name…' },
  { type: 'chips', field: 'status', label: 'Status', multi: true, options: STATUS_OPTIONS },
  { type: 'select', field: 'attendance_type', label: 'Attendance', options: ATTENDANCE_OPTIONS },
  { type: 'select', field: 'gender', label: 'Gender', options: GENDER_OPTIONS },
  { type: 'dateRange', field: 'admission_date', label: 'Admission date' },
]

export default function Students() {
  const navigate = useNavigate()
  const filters = useUrlFilters(FILTER_CONFIG)
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const canCreate = useCan('students', 'create')

  // Any filter change returns to page 1 (keepPreviousData keeps the old rows on
  // screen so this never blanks the table).
  const filterSignature = JSON.stringify(filters.params)
  useEffect(() => {
    setPage(1)
  }, [filterSignature])

  const { data, results, total, isFetching } = usePagedList<Student>({
    keyFor: (p) => qk.students.list({ ...filters.params, page: p }),
    fetchPage: (p) =>
      studentsApi.list(filtersToQuery(filters.params, { page: p })).then((r) => r.data as Paginated<Student>),
    page,
    pageSize: PAGE_SIZE,
  })
  const isRefreshing = isFetching && !!data

  // Warm the student detail cache on row hover so opening a student is instant.
  const prefetchStudent = usePrefetchDetail<Student>(
    (s) => qk.students.detail(s.id),
    (s) => studentsApi.get(s.id).then((r) => r.data)
  )

  const columns: Column<Student>[] = [
    {
      key: 'code',
      header: 'Admission #',
      render: (s) => <span className="font-mono text-primary-600 dark:text-primary-400">{s.code}</span>,
    },
    { key: 'full_name', header: 'Name', render: (s) => <span className="font-medium">{s.full_name}</span> },
    { key: 'current_class', header: 'Class', render: (s) => s.current_class || '—' },
    { key: 'status', header: 'Status', render: (s) => <StatusBadge status={s.status} /> },
    {
      key: 'attendance_type',
      header: 'Attendance',
      render: (s) => (s.attendance_type === 'boarder' ? 'Boarder' : 'Day scholar'),
    },
    {
      key: 'balances',
      header: 'Balance',
      align: 'right',
      render: (s) =>
        (s.balances ?? []).length === 0 ? (
          <span className="text-gray-400">—</span>
        ) : (
          <span className="tabular-nums">
            {(s.balances ?? []).map((b) => `${b.currency} ${fmtMoney(b.balance)}`).join(' · ')}
          </span>
        ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students"
        description="Admissions register — every learner and their fee position"
        icon={GraduationCap}
        actions={
          canCreate ? (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-2" /> New Student
            </Button>
          ) : undefined
        }
      />

      <FilterBar config={FILTER_CONFIG} filters={filters} />

      <div className="relative">
        <RefreshingOverlay active={isRefreshing} />
        <div className={refreshingContentClass(isRefreshing)}>
          <DataTable<Student>
            rowKey={(s) => s.id}
            columns={columns}
            data={results}
            loading={!data}
            onRowClick={(s) => navigate(`/app/students/${s.id}`)}
            onRowHover={prefetchStudent}
            emptyTitle="No students found"
            emptyDescription="No students match the current filters."
            pagination={{
              page,
              pageSize: PAGE_SIZE,
              total,
              onPageChange: setPage,
            }}
          />
        </div>
      </div>

      <StudentFormModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}
