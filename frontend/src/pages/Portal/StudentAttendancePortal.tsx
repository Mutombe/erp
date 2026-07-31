import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { CaretLeft, Lock } from '@phosphor-icons/react'
import RecordLink from '@/components/RecordLink'
import { Badge, EmptyState, Input, SkeletonCard, type BadgeVariant } from '@/components/ui'
import { portalApi } from '@/services/api'
import { formatDate, formatPercent } from '@/lib/utils'
import type { AttRow, AttendanceResponse } from '@/types/portal'

function isForbidden(error: unknown): boolean {
  return (error as { response?: { status?: number } })?.response?.status === 403
}

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  present: 'success',
  absent: 'danger',
  late: 'warning',
  excused: 'info',
}

const COUNT_TILES: { key: 'present' | 'absent' | 'late' | 'excused'; label: string; className: string }[] = [
  { key: 'present', label: 'Present', className: 'text-emerald-600 dark:text-emerald-400' },
  { key: 'absent', label: 'Absent', className: 'text-red-600 dark:text-red-400' },
  { key: 'late', label: 'Late', className: 'text-amber-600 dark:text-amber-400' },
  { key: 'excused', label: 'Excused', className: 'text-blue-600 dark:text-blue-400' },
]

export default function StudentAttendancePortal() {
  const { id } = useParams()
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  const params: Record<string, string> = {}
  if (start) params.start = start
  if (end) params.end = end

  const { data, isLoading, error } = useQuery({
    queryKey: ['portal', 'attendance', id, params],
    queryFn: () => portalApi.attendance(id!, params).then((r) => r.data as AttendanceResponse),
    placeholderData: keepPreviousData,
    retry: (count, err) => !isForbidden(err) && count < 2,
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  if (error && isForbidden(error)) {
    return (
      <EmptyState
        icon={Lock}
        title="You don't have access to this student"
        description="This student isn't linked to your account. If you believe this is a mistake, contact your school office."
      />
    )
  }

  if (error || !data) {
    return <EmptyState title="Couldn't load attendance" description="Please go back and try again." />
  }

  const { student, counts, total, rate, records } = data

  return (
    <div className="space-y-6">
      <RecordLink
        to={`/portal/students/${student.id}`}
        className="inline-flex items-center gap-1 text-sm font-medium no-underline hover:underline"
      >
        <CaretLeft className="w-4 h-4" /> Back to statement
      </RecordLink>

      {/* Headline rate */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">{student.name}</h1>
            <p className="text-xs uppercase tracking-wider text-gray-400 dark:text-slate-500 font-mono mt-0.5">
              {student.code}
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-xs uppercase tracking-wider text-gray-400 dark:text-slate-500">Attendance rate</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-slate-100 tabular-nums">
              {rate == null ? '—' : formatPercent(rate)}
            </p>
            <p className="text-xs text-gray-400 dark:text-slate-500">{total} session{total === 1 ? '' : 's'} recorded</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {COUNT_TILES.map((tile) => (
            <div
              key={tile.key}
              className="rounded-xl border border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/40 px-4 py-3"
            >
              <p className={`text-2xl font-bold tabular-nums ${tile.className}`}>{counts[tile.key]}</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">{tile.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Date range filter */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40">
          <Input type="date" label="From" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="w-40">
          <Input type="date" label="To" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        {(start || end) && (
          <button
            type="button"
            onClick={() => {
              setStart('')
              setEnd('')
            }}
            className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline pb-2.5"
          >
            Clear
          </button>
        )}
      </div>

      {/* Records */}
      {records.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-slate-400">No attendance records for this period.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-800 text-left text-xs uppercase text-gray-500 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Session</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Note</th>
              </tr>
            </thead>
            <tbody>
              {records.map((row: AttRow, idx) => (
                <tr key={idx} className="border-t border-gray-100 dark:border-slate-700/50">
                  <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(row.date)}</td>
                  <td className="px-4 py-2.5 capitalize">{row.session || '—'}</td>
                  <td className="px-4 py-2.5">{row.class_name || '—'}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={STATUS_VARIANT[row.status] ?? 'default'} dot>
                      <span className="capitalize">{row.status}</span>
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-slate-400">{row.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
