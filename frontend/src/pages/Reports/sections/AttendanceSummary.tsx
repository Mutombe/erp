import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { DownloadSimple } from '@phosphor-icons/react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { classesApi, gradesApi, reportsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { exportToCSV, formatExportNumber } from '@/lib/export'
import { useChartTheme } from '@/lib/chartTheme'
import { Button, RefreshingOverlay, Select, SkeletonTable, refreshingContentClass } from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import type { ClassRoom, Grade } from '@/types/students'
import type { AttendanceSummary as AttendanceSummaryData } from '@/types/attendance'
import PdfButton from './PdfButton'
import ExcelButton from './ExcelButton'
import ReportChart from './ReportChart'

const monthStart = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}
const today = () => new Date().toISOString().slice(0, 10)

// Present-rate colour: green (good) → amber → red (poor).
function rateColor(rate: number): string {
  if (rate >= 90) return 'text-emerald-600 dark:text-emerald-400'
  if (rate >= 75) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

const RATE_BANDS = [
  { label: '<50%', min: 0, max: 50 },
  { label: '50–75%', min: 50, max: 75 },
  { label: '75–90%', min: 75, max: 90 },
  { label: '90–100%', min: 90, max: 100.01 },
]

export default function AttendanceSummary() {
  const theme = useChartTheme()
  const [start, setStart] = useState(monthStart())
  const [end, setEnd] = useState(today())
  const [classRoom, setClassRoom] = useState('')
  const [grade, setGrade] = useState('')

  const params = useMemo(() => {
    const p: Record<string, string> = { start, end }
    if (classRoom) p.class_room = classRoom
    if (grade) p.grade = grade
    return p
  }, [start, end, classRoom, grade])

  const { data, isFetching } = useQuery({
    queryKey: qk.reports.attendanceSummary(params),
    queryFn: () => reportsApi.attendanceSummary(params).then((r) => r.data as AttendanceSummaryData),
    placeholderData: keepPreviousData,
  })
  const isRefreshing = isFetching && !!data

  const { data: classes } = useQuery({
    queryKey: qk.classes.list({ all: 1 }),
    queryFn: () =>
      classesApi.list({ page_size: 500 }).then((r) => (r.data as Paginated<ClassRoom>).results ?? (r.data as ClassRoom[])),
  })
  const { data: grades } = useQuery({
    queryKey: qk.grades.list(),
    queryFn: () => gradesApi.list({ page_size: 500 }).then((r) => (r.data.results ?? r.data) as Grade[]),
  })

  const distribution = useMemo(() => {
    const bands = RATE_BANDS.map((b) => ({ label: b.label, count: 0 }))
    for (const row of data?.rows ?? []) {
      const idx = RATE_BANDS.findIndex((b) => row.present_rate >= b.min && row.present_rate < b.max)
      if (idx >= 0) bands[idx].count++
    }
    return bands
  }, [data])

  const handleExport = () => {
    if (!data) return
    exportToCSV(
      data.rows,
      [
        { key: 'student_code', header: 'Code' },
        { key: 'student_name', header: 'Student' },
        { key: 'grade', header: 'Grade' },
        { key: 'present', header: 'Present' },
        { key: 'absent', header: 'Absent' },
        { key: 'late', header: 'Late' },
        { key: 'excused', header: 'Excused' },
        { key: 'total', header: 'Total' },
        { key: 'present_rate', header: 'Present rate %', format: formatExportNumber },
      ],
      `attendance-summary-${start}_${end}`
    )
  }

  const inputClass =
    'px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-slate-200'

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-gray-600 dark:text-gray-300">
            <span className="block mb-1">From</span>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
          </label>
          <label className="text-sm text-gray-600 dark:text-gray-300">
            <span className="block mb-1">To</span>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
          </label>
          <div className="min-w-[11rem]">
            <Select searchable placeholder="All classes" value={classRoom} onChange={(e) => setClassRoom(e.target.value)}>
              <option value="">All classes</option>
              {(classes ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name} · {c.grade_name}</option>
              ))}
            </Select>
          </div>
          <div className="min-w-[9rem]">
            <Select searchable placeholder="All grades" value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="">All grades</option>
              {(grades ?? []).map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" disabled={!data || data.rows.length === 0} onClick={handleExport}>
            <DownloadSimple className="w-4 h-4 mr-2" /> Export CSV
          </Button>
          <PdfButton reportKey="attendance-summary" params={params} disabled={!data} />
          <ExcelButton reportKey="attendance-summary" params={params} disabled={!data} />
        </div>
      </div>

      {data && (
        <div className="flex flex-wrap items-center gap-4">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 px-5 py-3">
            <p className="text-xs uppercase text-gray-400">Overall present rate</p>
            <p className={`text-2xl font-bold tabular-nums ${rateColor(data.overall_present_rate)}`}>
              {data.overall_present_rate}%
            </p>
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            <span className="tabular-nums font-medium text-gray-700 dark:text-gray-200">{data.totals.sessions}</span> records ·{' '}
            <span className="tabular-nums">{data.totals.present}</span> present ·{' '}
            <span className="tabular-nums">{data.totals.absent}</span> absent ·{' '}
            <span className="tabular-nums">{data.totals.late}</span> late ·{' '}
            <span className="tabular-nums">{data.totals.excused}</span> excused
          </div>
        </div>
      )}

      {data && (
        <ReportChart title="Students by present-rate band" height={200} isEmpty={data.rows.length === 0}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={distribution} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid stroke={theme.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: theme.tick, fontSize: 12 }} axisLine={{ stroke: theme.grid }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: theme.tick, fontSize: 12 }} axisLine={false} tickLine={false} width={40} />
              <Tooltip
                formatter={(v: number | string) => [v, 'Students']}
                cursor={{ fill: theme.cursorFill }}
                contentStyle={theme.tooltipStyle}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={72} isAnimationActive={!theme.reducedMotion}>
                {distribution.map((_b, i) => (
                  <Cell key={i} fill={theme.aged[Math.min(i + 1, theme.aged.length - 1)]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ReportChart>
      )}

      {!data ? (
        <SkeletonTable rows={8} />
      ) : (
        <div className="relative overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <RefreshingOverlay active={isRefreshing} />
          <table className={refreshingContentClass(isRefreshing, 'w-full text-sm')}>
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Grade</th>
                <th className="px-4 py-3 text-right">Present</th>
                <th className="px-4 py-3 text-right">Absent</th>
                <th className="px-4 py-3 text-right">Late</th>
                <th className="px-4 py-3 text-right">Excused</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Rate</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.student_id} className="border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/60">
                  <td className="px-4 py-2.5">
                    <Link to={`/app/students/${row.student_id}`} className="text-primary-600 dark:text-primary-400 hover:underline">
                      <span className="font-mono text-xs mr-2">{row.student_code}</span>
                      {row.student_name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">{row.grade}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{row.present}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{row.absent}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{row.late}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{row.excused}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{row.total}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${rateColor(row.present_rate)}`}>
                    {row.present_rate}%
                  </td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-400">No attendance records for this selection.</td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold">
              <tr>
                <td className="px-4 py-3" colSpan={2}>Totals</td>
                <td className="px-4 py-3 text-right tabular-nums">{data.totals.present}</td>
                <td className="px-4 py-3 text-right tabular-nums">{data.totals.absent}</td>
                <td className="px-4 py-3 text-right tabular-nums">{data.totals.late}</td>
                <td className="px-4 py-3 text-right tabular-nums">{data.totals.excused}</td>
                <td className="px-4 py-3 text-right tabular-nums">{data.totals.sessions}</td>
                <td className={`px-4 py-3 text-right tabular-nums ${rateColor(data.overall_present_rate)}`}>{data.overall_present_rate}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
