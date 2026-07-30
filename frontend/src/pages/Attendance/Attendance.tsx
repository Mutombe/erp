import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ClipboardText, Check, FloppyDisk, ClockClockwise } from '@phosphor-icons/react'
import { attendanceSessionsApi, classesApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { cn, formatDate } from '@/lib/utils'
import { showToast, parseApiError } from '@/lib/toast'
import {
  Button,
  DatePicker,
  PageHeader,
  Select,
  SkeletonTable,
  RefreshingOverlay,
  refreshingContentClass,
} from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import type { ClassRoom } from '@/types/students'
import {
  ATTENDANCE_STATUSES,
  SESSION_SLOTS,
  type AttendanceSession,
  type AttendanceSessionListItem,
  type AttendanceStatus,
} from '@/types/attendance'

const today = () => new Date().toISOString().slice(0, 10)

interface Mark {
  status: AttendanceStatus
  note: string
}

// Segmented present/absent/late/excused control.
const STATUS_STYLE: Record<AttendanceStatus, string> = {
  present: 'bg-emerald-600 text-white border-emerald-600',
  absent: 'bg-red-600 text-white border-red-600',
  late: 'bg-amber-500 text-white border-amber-500',
  excused: 'bg-blue-600 text-white border-blue-600',
}

function StatusSegmented({ value, onChange }: { value: AttendanceStatus; onChange: (s: AttendanceStatus) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 dark:border-slate-600 overflow-hidden">
      {ATTENDANCE_STATUSES.map(([status, label], i) => {
        const active = value === status
        return (
          <button
            key={status}
            type="button"
            onClick={() => onChange(status)}
            className={cn(
              'px-2.5 py-1 text-xs font-medium transition-colors',
              i > 0 && 'border-l border-gray-200 dark:border-slate-600',
              active
                ? STATUS_STYLE[status]
                : 'bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800'
            )}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

export default function Attendance() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const classRoom = searchParams.get('class') ?? ''
  const rawDate = searchParams.get('date') ?? ''
  const date = !rawDate || rawDate === 'today' ? today() : rawDate
  const session = searchParams.get('session') ?? 'full_day'

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }

  const { data: classes } = useQuery({
    queryKey: qk.classes.list({ all: 1 }),
    queryFn: () =>
      classesApi.list({ page_size: 500 }).then((r) => (r.data as Paginated<ClassRoom>).results ?? (r.data as ClassRoom[])),
  })

  const canLoad = !!classRoom && !!date && !!session

  // POST is get-or-create + auto-seeds a record per active student — idempotent,
  // so it is safe to drive from a query keyed on the chosen class/date/session.
  const { data: sessionData, isFetching } = useQuery({
    queryKey: qk.attendanceSessions.list({ class_room: classRoom, date, session }),
    queryFn: () =>
      attendanceSessionsApi
        .create({ class_room: Number(classRoom), date, session })
        .then((r) => r.data as AttendanceSession),
    enabled: canLoad,
    placeholderData: keepPreviousData,
  })
  const isRefreshing = isFetching && !!sessionData

  const [marks, setMarks] = useState<Record<number, Mark>>({})

  // Re-seed the editable grid whenever a different (or freshly saved) session loads.
  useEffect(() => {
    if (!sessionData) return
    const next: Record<number, Mark> = {}
    for (const r of sessionData.records) next[r.student] = { status: r.status, note: r.note || '' }
    setMarks(next)
  }, [sessionData])

  const setStatus = (studentId: number, status: AttendanceStatus) =>
    setMarks((m) => ({ ...m, [studentId]: { status, note: m[studentId]?.note ?? '' } }))
  const setNote = (studentId: number, note: string) =>
    setMarks((m) => ({ ...m, [studentId]: { status: m[studentId]?.status ?? 'present', note } }))
  const markAllPresent = () =>
    setMarks((m) => {
      const next = { ...m }
      for (const r of sessionData?.records ?? []) next[r.student] = { status: 'present', note: next[r.student]?.note ?? '' }
      return next
    })

  const saveMutation = useMutation({
    mutationFn: () =>
      attendanceSessionsApi.mark(
        sessionData!.id,
        (sessionData?.records ?? []).map((r) => ({
          student: r.student,
          status: marks[r.student]?.status ?? 'present',
          note: marks[r.student]?.note ?? '',
        }))
      ),
    onSuccess: () => {
      showToast.success('Attendance saved')
      queryClient.invalidateQueries({ queryKey: qk.attendanceSessions.all })
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to save attendance')),
  })

  // Keyboard: press "a" (outside inputs) to mark everyone present.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
      if (e.key.toLowerCase() === 'a' && sessionData) {
        e.preventDefault()
        markAllPresent()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionData])

  const summary = useMemo(() => {
    const counts = { present: 0, absent: 0, late: 0, excused: 0 }
    for (const r of sessionData?.records ?? []) {
      const s = marks[r.student]?.status ?? 'present'
      counts[s]++
    }
    return counts
  }, [marks, sessionData])

  const recentEnabled = !!classRoom
  const { data: recent } = useQuery({
    queryKey: qk.attendanceSessions.list({ class_room: classRoom, recent: 1 }),
    queryFn: () =>
      attendanceSessionsApi
        .list({ class_room: classRoom, ordering: '-date', page_size: 8 })
        .then((r) => (r.data as Paginated<AttendanceSessionListItem>).results),
    enabled: recentEnabled,
  })

  const sessionLabel = (slot: string) => SESSION_SLOTS.find(([v]) => v === slot)?.[1] ?? slot

  return (
    <div className="space-y-6">
      <PageHeader title="Attendance" description="Mark and review daily class registers" icon={ClipboardText} />

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1 max-w-sm">
          <Select label="Class" searchable placeholder="Select class…" value={classRoom} onChange={(e) => setParam('class', e.target.value)}>
            {(classes ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name} · {c.grade_name}</option>
            ))}
          </Select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Date</label>
          <DatePicker value={date} onChange={(v) => setParam('date', v)} className="w-44" />
        </div>
        <div className="min-w-[10rem]">
          <Select label="Session" value={session} onChange={(e) => setParam('session', e.target.value)}>
            {SESSION_SLOTS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </div>
      </div>

      {!canLoad ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-slate-600 p-10 text-center text-gray-500">
          Select a class, date and session to load the register.
        </div>
      ) : !sessionData ? (
        <SkeletonTable rows={8} />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_18rem] gap-6">
          {/* Marking grid */}
          <div className="space-y-3 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <SummaryPill label="Present" value={summary.present} className="text-emerald-600 dark:text-emerald-400" />
                <SummaryPill label="Absent" value={summary.absent} className="text-red-600 dark:text-red-400" />
                <SummaryPill label="Late" value={summary.late} className="text-amber-600 dark:text-amber-400" />
                <SummaryPill label="Excused" value={summary.excused} className="text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={markAllPresent} title="Shortcut: press A">
                  <Check className="w-4 h-4 mr-1.5" /> All present
                </Button>
                <Button size="sm" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
                  <FloppyDisk className="w-4 h-4 mr-1.5" /> Save
                </Button>
              </div>
            </div>

            <div className="relative">
              <RefreshingOverlay active={isRefreshing} />
              <div className={refreshingContentClass(isRefreshing, 'overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700')}>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                    <tr>
                      <th className="px-4 py-3">Code</th>
                      <th className="px-4 py-3">Student</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessionData.records.map((r) => (
                      <tr key={r.id} className="border-t border-gray-100 dark:border-gray-700/50">
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{r.student_code}</td>
                        <td className="px-4 py-2.5 font-medium">{r.student_name}</td>
                        <td className="px-4 py-2.5">
                          <StatusSegmented
                            value={marks[r.student]?.status ?? 'present'}
                            onChange={(s) => setStatus(r.student, s)}
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <input
                            value={marks[r.student]?.note ?? ''}
                            onChange={(e) => setNote(r.student, e.target.value)}
                            placeholder="—"
                            className="w-full max-w-[16rem] px-2.5 py-1 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200"
                          />
                        </td>
                      </tr>
                    ))}
                    {sessionData.records.length === 0 && (
                      <tr className="border-t border-gray-100 dark:border-gray-700/50">
                        <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                          No active students in this class to mark.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Recent sessions */}
          <aside className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
              <ClockClockwise className="w-4 h-4 text-gray-400" /> Recent registers
            </h3>
            <div className="space-y-1.5">
              {(recent ?? []).length === 0 && <p className="text-sm text-gray-500">No earlier registers for this class.</p>}
              {(recent ?? []).map((s) => {
                const isCurrent = s.date === date && s.session === session
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      setParam('date', s.date)
                      setParam('session', s.session)
                    }}
                    className={cn(
                      'w-full text-left rounded-lg border px-3 py-2 transition-colors',
                      isCurrent
                        ? 'border-primary-300 bg-primary-50 dark:border-primary-700 dark:bg-primary-900/20'
                        : 'border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800'
                    )}
                  >
                    <span className="block text-sm font-medium text-gray-900 dark:text-slate-100">{formatDate(s.date)}</span>
                    <span className="block text-xs text-gray-500">
                      {sessionLabel(s.session)} · {s.present_count}/{s.record_count} present
                    </span>
                  </button>
                )
              })}
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}

function SummaryPill({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-slate-800 px-2.5 py-1">
      <span className={cn('font-semibold tabular-nums', className)}>{value}</span>
      <span className="text-gray-500 dark:text-slate-400">{label}</span>
    </span>
  )
}
