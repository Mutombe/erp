import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { GraduationCap, Plus } from 'lucide-react'
import { studentsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { useDebounce } from '@/lib/utils'
import { Button, DataTable, PageHeader, StatusBadge, type Column } from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import { STUDENT_STATUSES, type Student } from '@/types/students'
import { fmtMoney } from '@/types/fees'
import StudentFormModal from './StudentFormModal'

export default function Students() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const statusFilter = searchParams.get('status') ?? ''
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const debouncedSearch = useDebounce(search, 300)

  const { data, isLoading } = useQuery({
    queryKey: qk.students.list({ page, search: debouncedSearch, status: statusFilter }),
    queryFn: () =>
      studentsApi
        .list({ page, search: debouncedSearch || undefined, status: statusFilter || undefined })
        .then((r) => r.data as Paginated<Student>),
    placeholderData: keepPreviousData,
  })

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
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-2" /> New Student
          </Button>
        }
      />

      <div className="flex gap-2 flex-wrap">
        {['', ...STUDENT_STATUSES].map((s) => (
          <button
            key={s}
            onClick={() => {
              const next = new URLSearchParams(searchParams)
              if (s) next.set('status', s)
              else next.delete('status')
              setSearchParams(next, { replace: true })
              setPage(1)
            }}
            className={`px-3 py-1.5 text-sm rounded-full border capitalize ${
              statusFilter === s
                ? 'bg-primary-600 text-white border-primary-600'
                : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      <DataTable<Student>
        rowKey={(s) => s.id}
        columns={columns}
        data={data?.results ?? []}
        loading={isLoading}
        searchable
        searchValue={search}
        onSearch={(q) => { setSearch(q); setPage(1) }}
        searchPlaceholder="Search admission code or name…"
        onRowClick={(s) => navigate(`/app/students/${s.id}`)}
        emptyTitle="No students found"
        pagination={{
          page,
          pageSize: 25,
          total: data?.count ?? 0,
          onPageChange: setPage,
        }}
      />

      <StudentFormModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}
