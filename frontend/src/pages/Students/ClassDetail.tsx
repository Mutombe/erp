import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { School } from 'lucide-react'
import { academicYearsApi, classesApi, enrollmentsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { formatDate } from '@/lib/utils'
import { DataTable, PageHeader, SkeletonCard, StatusBadge, type Column } from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import type { AcademicYear, ClassRoom, Enrollment } from '@/types/students'

export default function ClassDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [page, setPage] = useState(1)

  const { data: classRoom, isLoading } = useQuery({
    queryKey: qk.classes.detail(id!),
    queryFn: () => classesApi.get(id!).then((r) => r.data as ClassRoom),
  })

  const { data: years } = useQuery({
    queryKey: qk.academicYears.list(),
    queryFn: () => academicYearsApi.list().then((r) => r.data as AcademicYear[]),
  })

  const { data: roster, isLoading: rosterLoading } = useQuery({
    queryKey: qk.enrollments.list({ class_room: id, page }),
    queryFn: () =>
      enrollmentsApi.list({ class_room: id, page }).then((r) => r.data as Paginated<Enrollment>),
    enabled: Boolean(id),
  })

  if (isLoading || !classRoom) return <SkeletonCard />

  const yearName = (years ?? []).find((y) => y.id === classRoom.academic_year)?.name ?? `#${classRoom.academic_year}`

  const columns: Column<Enrollment>[] = [
    {
      key: 'student_code',
      header: 'Admission #',
      render: (e) => (
        <Link
          to={`/app/students/${e.student}`}
          onClick={(ev) => ev.stopPropagation()}
          className="font-mono text-primary-600 dark:text-primary-400 hover:underline"
        >
          {e.student_code}
        </Link>
      ),
    },
    { key: 'student_name', header: 'Student', render: (e) => <span className="font-medium">{e.student_name}</span> },
    {
      key: 'attendance_type',
      header: 'Attendance',
      render: (e) => (e.attendance_type === 'boarder' ? 'Boarder' : 'Day scholar'),
    },
    {
      key: 'enrolled_date',
      header: 'Enrolled',
      render: (e) => (e.enrolled_date ? formatDate(e.enrolled_date) : '—'),
    },
    { key: 'status', header: 'Status', render: (e) => <StatusBadge status={e.status} /> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={classRoom.name}
        description={`${classRoom.grade_name} · ${yearName}`}
        icon={School}
        backLink="/app/classes"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div><span className="text-gray-500 block">Grade</span>{classRoom.grade_name}</div>
        <div><span className="text-gray-500 block">Academic year</span>{yearName}</div>
        <div><span className="text-gray-500 block">Teacher</span>{classRoom.teacher_name || '—'}</div>
        <div>
          <span className="text-gray-500 block">Enrolment</span>
          <span className="tabular-nums">
            {classRoom.student_count}{classRoom.capacity ? ` / ${classRoom.capacity}` : ''} students
          </span>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Roster</h3>
        <DataTable<Enrollment>
          rowKey={(e) => e.id}
          columns={columns}
          data={roster?.results ?? []}
          loading={rosterLoading}
          onRowClick={(e) => navigate(`/app/students/${e.student}`)}
          emptyTitle="No enrollments"
          emptyDescription="No students are enrolled in this class."
          pagination={{ page, pageSize: 25, total: roster?.count ?? 0, onPageChange: setPage }}
        />
      </div>
    </div>
  )
}
