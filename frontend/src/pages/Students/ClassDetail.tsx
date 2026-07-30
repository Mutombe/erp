import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Student, ClipboardText } from '@phosphor-icons/react'
import { academicYearsApi, classesApi, enrollmentsApi, teachersApi, teachingAssignmentsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { formatDate } from '@/lib/utils'
import { showToast, parseApiError } from '@/lib/toast'
import RecordLink from '@/components/RecordLink'
import {
  Button,
  DataTable,
  PageHeader,
  RefreshingOverlay,
  Select,
  SkeletonCard,
  StatusBadge,
  refreshingContentClass,
  type Column,
} from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import type { AcademicYear, ClassRoom, Enrollment, Teacher, TeachingAssignment } from '@/types/students'

export default function ClassDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)

  const { data: classRoom } = useQuery({
    queryKey: qk.classes.detail(id!),
    queryFn: () => classesApi.get(id!).then((r) => r.data as ClassRoom),
  })

  const { data: years } = useQuery({
    queryKey: qk.academicYears.list(),
    queryFn: () => academicYearsApi.list().then((r) => r.data as AcademicYear[]),
  })

  const { data: teachers } = useQuery({
    queryKey: qk.teachers.list({ all: 1 }),
    queryFn: () =>
      teachersApi.list({ page_size: 500 }).then((r) => (r.data as Paginated<Teacher>).results ?? (r.data as Teacher[])),
  })

  const { data: assignments } = useQuery({
    queryKey: qk.teachingAssignments.list({ class_room: id }),
    queryFn: () =>
      teachingAssignmentsApi
        .list({ class_room: id, page_size: 500 })
        .then((r) => (r.data.results ?? r.data) as TeachingAssignment[]),
    enabled: Boolean(id),
  })

  const { data: roster, isFetching: rosterFetching } = useQuery({
    queryKey: qk.enrollments.list({ class_room: id, page }),
    queryFn: () =>
      enrollmentsApi.list({ class_room: id, page }).then((r) => r.data as Paginated<Enrollment>),
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
  })

  const setFormTeacher = useMutation({
    mutationFn: (teacherId: string) =>
      classesApi.update(id!, { class_teacher: teacherId ? Number(teacherId) : null }),
    onSuccess: () => {
      showToast.success('Form teacher updated')
      queryClient.invalidateQueries({ queryKey: qk.classes.all })
      queryClient.invalidateQueries({ queryKey: qk.teachers.all })
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to update form teacher')),
  })

  const rosterRefreshing = rosterFetching && !!roster

  if (!classRoom) return <SkeletonCard />

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
        icon={Student}
        backLink="/app/classes"
        actions={
          <Button onClick={() => navigate(`/app/attendance?class=${classRoom.id}&date=today`)}>
            <ClipboardText className="w-4 h-4 mr-2" /> Mark attendance
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div><span className="text-gray-500 block">Grade</span>{classRoom.grade_name}</div>
        <div><span className="text-gray-500 block">Academic year</span>{yearName}</div>
        <div>
          <span className="text-gray-500 block">Form teacher</span>
          {classRoom.class_teacher ? (
            <Link to={`/app/teachers/${classRoom.class_teacher}`} className="text-primary-600 dark:text-primary-400 hover:underline">
              {classRoom.class_teacher_name}
            </Link>
          ) : (
            <span className="text-gray-400">Unassigned</span>
          )}
        </div>
        <div>
          <span className="text-gray-500 block">Enrolment</span>
          <span className="tabular-nums">
            {classRoom.student_count}{classRoom.capacity ? ` / ${classRoom.capacity}` : ''} students
          </span>
        </div>
      </div>

      {/* Form teacher selector */}
      <div className="max-w-sm">
        <Select
          label="Assign form teacher"
          searchable
          placeholder="Select teacher…"
          value={classRoom.class_teacher ? String(classRoom.class_teacher) : ''}
          onChange={(e) => setFormTeacher.mutate(e.target.value)}
          disabled={setFormTeacher.isPending}
        >
          <option value="">Unassigned</option>
          {(teachers ?? []).map((t) => (
            <option key={t.id} value={t.id}>{t.full_name}</option>
          ))}
        </Select>
      </div>

      {/* Subject teachers */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Subject teachers</h3>
        {(assignments ?? []).length === 0 ? (
          <p className="text-sm text-gray-500">
            No subject teachers assigned. Add assignments from a teacher's page.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Teacher</th>
                </tr>
              </thead>
              <tbody>
                {(assignments ?? []).map((a) => (
                  <tr key={a.id} className="border-t border-gray-100 dark:border-gray-700/50">
                    <td className="px-4 py-2.5">
                      <RecordLink to={`/app/subjects/${a.subject}`}>
                        <span className="font-mono text-xs mr-2">{a.subject_code}</span>
                        {a.subject_name}
                      </RecordLink>
                    </td>
                    <td className="px-4 py-2.5">
                      <RecordLink to={`/app/teachers/${a.teacher}`}>{a.teacher_name}</RecordLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Roster</h3>
        <div className="relative">
          <RefreshingOverlay active={rosterRefreshing} />
          <div className={refreshingContentClass(rosterRefreshing)}>
            <DataTable<Enrollment>
              rowKey={(e) => e.id}
              columns={columns}
              data={roster?.results ?? []}
              loading={!roster}
              onRowClick={(e) => navigate(`/app/students/${e.student}`)}
              emptyTitle="No enrollments"
              emptyDescription="No students are enrolled in this class."
              pagination={{ page, pageSize: 25, total: roster?.count ?? 0, onPageChange: setPage }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
