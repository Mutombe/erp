import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { BookBookmark, Chalkboard } from '@phosphor-icons/react'
import { subjectsApi, teachingAssignmentsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import RecordLink from '@/components/RecordLink'
import {
  Badge,
  PageHeader,
  RefreshingOverlay,
  SkeletonCard,
  SkeletonTable,
  refreshingContentClass,
} from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import type { Subject, TeachingAssignment } from '@/types/students'

export default function SubjectDetail() {
  const { id } = useParams()

  const { data: subject } = useQuery({
    queryKey: qk.subjects.detail(id!),
    queryFn: () => subjectsApi.get(id!).then((r) => r.data as Subject),
  })

  const { data: assignments, isFetching } = useQuery({
    queryKey: qk.teachingAssignments.list({ subject: id }),
    queryFn: () =>
      teachingAssignmentsApi
        .list({ subject: id, page_size: 500 })
        .then((r) => (r.data.results ?? r.data) as TeachingAssignment[]),
    enabled: !!id,
  })

  if (!subject) return <SkeletonCard />

  const rows = assignments ?? []
  const isRefreshing = isFetching && !!assignments

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${subject.code} · ${subject.name}`}
        description="Who teaches this subject, and in which classes"
        icon={BookBookmark}
        backLink="/app/subjects"
        actions={
          <Badge variant={subject.is_active ? 'success' : 'default'} dot>
            {subject.is_active ? 'Active' : 'Inactive'}
          </Badge>
        }
      />

      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2 flex items-center gap-2">
          <Chalkboard className="w-4 h-4" /> Teaching assignments
        </h3>
        {!assignments ? (
          <SkeletonTable rows={4} />
        ) : (
          <div className="relative">
            <RefreshingOverlay active={isRefreshing} />
            <div className={refreshingContentClass(isRefreshing, 'overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700')}>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3">Teacher</th>
                    <th className="px-4 py-3">Class</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={2} className="px-4 py-6 text-center text-gray-500">No teachers assigned to this subject yet</td>
                    </tr>
                  )}
                  {rows.map((a) => (
                    <tr key={a.id} className="border-t border-gray-100 dark:border-gray-700/50">
                      <td className="px-4 py-2.5">
                        <RecordLink to={`/app/teachers/${a.teacher}`}>
                          <span className="font-mono">{a.teacher_code}</span> {a.teacher_name}
                        </RecordLink>
                      </td>
                      <td className="px-4 py-2.5">
                        <RecordLink to={`/app/classes/${a.class_room}`}>{a.class_room_name}</RecordLink>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
