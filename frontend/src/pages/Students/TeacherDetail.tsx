import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  Chalkboard,
  Student as StudentIcon,
  BookBookmark,
  GraduationCap,
  PencilSimple,
  Plus,
  Trash,
  UserCircle,
} from '@phosphor-icons/react'
import { classesApi, subjectsApi, teachersApi, teachingAssignmentsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { formatDate } from '@/lib/utils'
import RecordLink from '@/components/RecordLink'
import { showToast, parseApiError } from '@/lib/toast'
import {
  Badge,
  Button,
  IconButton,
  PageHeader,
  Select,
  SkeletonCard,
  StatsCard,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import type { ClassBrief, ClassRoom, StudentBrief, Subject, Teacher, TeachingAssignment } from '@/types/students'
import TeacherFormModal from './TeacherFormModal'

const TABS = ['classes', 'assignments', 'students'] as const

export default function TeacherDetail() {
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [editOpen, setEditOpen] = useState(false)
  const tabParam = searchParams.get('tab') ?? ''
  const initialTab = (TABS as readonly string[]).includes(tabParam) ? tabParam : 'classes'

  const { data: teacher } = useQuery({
    queryKey: qk.teachers.detail(id!),
    queryFn: () => teachersApi.get(id!).then((r) => r.data as Teacher),
  })

  if (!teacher) return <SkeletonCard />

  const setTab = (tab: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', tab)
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={teacher.full_name}
        description={`${teacher.code}${teacher.qualification ? ` · ${teacher.qualification}` : ''}`}
        icon={Chalkboard}
        backLink="/app/teachers"
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status={teacher.status} />
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <PencilSimple className="w-4 h-4 mr-2" /> Edit
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Classes" value={teacher.class_count} icon={StudentIcon} color="blue" />
        <StatsCard title="Students" value={teacher.student_count} icon={GraduationCap} color="green" />
        <StatsCard title="Subjects" value={teacher.subjects.length} icon={BookBookmark} color="purple" />
        <div className="bg-white dark:bg-slate-800/40 rounded-xl border border-gray-200 dark:border-slate-700 p-6 text-sm space-y-2">
          <div className="flex justify-between"><span className="text-gray-500">Email</span><span className="truncate ml-2">{teacher.email || '—'}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Phone</span><span>{teacher.phone || '—'}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Hire date</span><span>{teacher.hire_date ? formatDate(teacher.hire_date) : '—'}</span></div>
        </div>
      </div>

      <Tabs defaultValue={initialTab} onChange={setTab}>
        <TabsList className="dark:bg-gray-800">
          <TabsTrigger value="classes" icon={StudentIcon}>Classes</TabsTrigger>
          <TabsTrigger value="assignments" icon={BookBookmark}>Subjects &amp; assignments</TabsTrigger>
          <TabsTrigger value="students" icon={GraduationCap}>Students</TabsTrigger>
        </TabsList>

        <TabsContent value="classes" className="mt-6">
          <ClassesTab teacher={teacher} />
        </TabsContent>
        <TabsContent value="assignments" className="mt-6">
          <AssignmentsTab teacher={teacher} />
        </TabsContent>
        <TabsContent value="students" className="mt-6">
          <StudentsTab teacherId={teacher.id} />
        </TabsContent>
      </Tabs>

      <TeacherFormModal open={editOpen} teacher={teacher} onClose={() => setEditOpen(false)} />
    </div>
  )
}

function ClassCard({ cls }: { cls: ClassBrief }) {
  return (
    <Link
      to={`/app/classes/${cls.id}`}
      className="block rounded-xl border border-gray-200 dark:border-slate-700 px-4 py-3 hover:border-primary-300 hover:bg-primary-50/40 dark:hover:bg-primary-900/10 transition-colors"
    >
      <span className="font-medium text-primary-600 dark:text-primary-400">{cls.name}</span>
      <span className="block text-xs text-gray-500 mt-0.5">{cls.grade_name}</span>
    </Link>
  )
}

function ClassesTab({ teacher }: { teacher: Teacher }) {
  const { data: assignments } = useQuery({
    queryKey: qk.teachingAssignments.list({ teacher: teacher.id }),
    queryFn: () =>
      teachingAssignmentsApi
        .list({ teacher: teacher.id, page_size: 500 })
        .then((r) => (r.data.results ?? r.data) as TeachingAssignment[]),
  })

  // Distinct classes the teacher is taught in via subject assignments.
  const taught = new Map<number, { id: number; name: string }>()
  for (const a of assignments ?? []) {
    if (!taught.has(a.class_room)) taught.set(a.class_room, { id: a.class_room, name: a.class_room_name })
  }

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Form classes</h3>
        {teacher.classes.length === 0 ? (
          <p className="text-sm text-gray-500">Not a form teacher for any class.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {teacher.classes.map((c) => <ClassCard key={c.id} cls={c} />)}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Classes taught (via subject assignments)</h3>
        {taught.size === 0 ? (
          <p className="text-sm text-gray-500">No subject assignments yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {[...taught.values()].map((c) => (
              <Link
                key={c.id}
                to={`/app/classes/${c.id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 dark:border-slate-600 px-3 py-1.5 text-sm text-primary-600 dark:text-primary-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              >
                <StudentIcon className="w-4 h-4" /> {c.name}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function AssignmentsTab({ teacher }: { teacher: Teacher }) {
  const queryClient = useQueryClient()
  const [classRoom, setClassRoom] = useState('')
  const [subject, setSubject] = useState('')
  const [formClass, setFormClass] = useState('')

  const { data: assignments } = useQuery({
    queryKey: qk.teachingAssignments.list({ teacher: teacher.id }),
    queryFn: () =>
      teachingAssignmentsApi
        .list({ teacher: teacher.id, page_size: 500 })
        .then((r) => (r.data.results ?? r.data) as TeachingAssignment[]),
  })

  const { data: classes } = useQuery({
    queryKey: qk.classes.list({ all: 1 }),
    queryFn: () => classesApi.list({ page_size: 500 }).then((r) => (r.data as Paginated<ClassRoom>).results ?? (r.data as ClassRoom[])),
  })
  const { data: subjects } = useQuery({
    queryKey: qk.subjects.list({ all: 1 }),
    queryFn: () => subjectsApi.list({ page_size: 500, is_active: true }).then((r) => (r.data as Paginated<Subject>).results ?? (r.data as Subject[])),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: qk.teachingAssignments.all })
    queryClient.invalidateQueries({ queryKey: qk.teachers.all })
    queryClient.invalidateQueries({ queryKey: qk.classes.all })
  }

  const addMutation = useMutation({
    mutationFn: () =>
      teachingAssignmentsApi.create({ teacher: teacher.id, class_room: Number(classRoom), subject: Number(subject) }),
    onSuccess: () => {
      showToast.success('Assignment added')
      setClassRoom('')
      setSubject('')
      invalidate()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to add assignment')),
  })

  const removeMutation = useMutation({
    mutationFn: (assignmentId: number) => teachingAssignmentsApi.delete(assignmentId),
    onSuccess: () => {
      showToast.success('Assignment removed')
      invalidate()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to remove assignment')),
  })

  const setFormTeacherMutation = useMutation({
    mutationFn: () => classesApi.update(Number(formClass), { class_teacher: teacher.id }),
    onSuccess: () => {
      showToast.success('Form teacher set')
      setFormClass('')
      invalidate()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to set form teacher')),
  })

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Teaching assignments</h3>
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {(assignments ?? []).map((a) => (
                <tr key={a.id} className="border-t border-gray-100 dark:border-gray-700/50">
                  <td className="px-4 py-2.5">
                    <RecordLink to={`/app/classes/${a.class_room}`}>{a.class_room_name}</RecordLink>
                  </td>
                  <td className="px-4 py-2.5">
                    <RecordLink to={`/app/subjects/${a.subject}`}>
                      <span className="font-mono text-xs mr-2">{a.subject_code}</span>
                      {a.subject_name}
                    </RecordLink>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <IconButton
                      icon={Trash}
                      aria-label="Remove assignment"
                      variant="ghost"
                      className="text-red-500 hover:text-red-600"
                      onClick={() => removeMutation.mutate(a.id)}
                    />
                  </td>
                </tr>
              ))}
              {(assignments ?? []).length === 0 && (
                <tr className="border-t border-gray-100 dark:border-gray-700/50">
                  <td colSpan={3} className="px-4 py-6 text-center text-gray-500">No assignments yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-gray-300 dark:border-slate-600 p-4">
          <div className="min-w-[12rem] flex-1">
            <Select label="Class" searchable placeholder="Select class…" value={classRoom} onChange={(e) => setClassRoom(e.target.value)}>
              {(classes ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name} · {c.grade_name}</option>
              ))}
            </Select>
          </div>
          <div className="min-w-[12rem] flex-1">
            <Select label="Subject" searchable placeholder="Select subject…" value={subject} onChange={(e) => setSubject(e.target.value)}>
              {(subjects ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </div>
          <Button
            onClick={() => addMutation.mutate()}
            loading={addMutation.isPending}
            disabled={!classRoom || !subject}
          >
            <Plus className="w-4 h-4 mr-2" /> Add assignment
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Set as form teacher</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">Make this teacher the form teacher for a class (updates the class record).</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1 max-w-sm">
            <Select label="Class" searchable placeholder="Select class…" value={formClass} onChange={(e) => setFormClass(e.target.value)}>
              {(classes ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name} · {c.grade_name}</option>
              ))}
            </Select>
          </div>
          <Button
            variant="secondary"
            onClick={() => setFormTeacherMutation.mutate()}
            loading={setFormTeacherMutation.isPending}
            disabled={!formClass}
          >
            <UserCircle className="w-4 h-4 mr-2" /> Set form teacher
          </Button>
        </div>
      </section>
    </div>
  )
}

function StudentsTab({ teacherId }: { teacherId: number }) {
  const { data: students, isLoading } = useQuery({
    queryKey: qk.teachers.students(teacherId),
    queryFn: () => teachersApi.students(teacherId).then((r) => r.data as StudentBrief[]),
  })

  if (isLoading) return <SkeletonCard />

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
          <tr>
            <th className="px-4 py-3">Code</th>
            <th className="px-4 py-3">Student</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {(students ?? []).map((s) => (
            <tr key={s.id} className="border-t border-gray-100 dark:border-gray-700/50">
              <td className="px-4 py-2.5">
                <Link to={`/app/students/${s.id}`} className="font-mono text-primary-600 dark:text-primary-400 hover:underline">
                  {s.code}
                </Link>
              </td>
              <td className="px-4 py-2.5">{s.full_name}</td>
              <td className="px-4 py-2.5"><Badge variant="default" dot>{s.status}</Badge></td>
            </tr>
          ))}
          {(students ?? []).length === 0 && (
            <tr className="border-t border-gray-100 dark:border-gray-700/50">
              <td colSpan={3} className="px-4 py-6 text-center text-gray-500">
                No students — this teacher isn't a form teacher for any class.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
