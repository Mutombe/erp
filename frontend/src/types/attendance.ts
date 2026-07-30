// Shapes mirror backend/apps/attendance/serializers.py

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused'
export type SessionSlot = 'full_day' | 'morning' | 'afternoon'

export interface AttendanceRecord {
  id: number
  session: number
  student: number
  student_code: string
  student_name: string
  status: AttendanceStatus
  note: string
}

export interface AttendanceSession {
  id: number
  class_room: number
  class_room_name: string
  grade_name: string
  date: string
  session: SessionSlot
  marked_by: number | null
  notes: string
  records: AttendanceRecord[]
  record_count: number
  present_count: number
  created_at: string
}

/** List serializer omits the nested records grid. */
export type AttendanceSessionListItem = Omit<AttendanceSession, 'records'>

/** Body row for POST /attendance/sessions/{id}/mark/. */
export interface MarkEntry {
  student: number
  status: AttendanceStatus
  note?: string
}

// GET /reports/attendance-summary/
export interface AttendanceSummaryRow {
  student_id: number
  student_code: string
  student_name: string
  grade: string
  present: number
  absent: number
  late: number
  excused: number
  total: number
  present_rate: number
}

export interface AttendanceSummary {
  start: string
  end: string
  rows: AttendanceSummaryRow[]
  totals: { present: number; absent: number; late: number; excused: number; sessions: number }
  overall_present_rate: number
}

export const ATTENDANCE_STATUSES: [AttendanceStatus, string][] = [
  ['present', 'Present'],
  ['absent', 'Absent'],
  ['late', 'Late'],
  ['excused', 'Excused'],
]

export const SESSION_SLOTS: [SessionSlot, string][] = [
  ['full_day', 'Full day'],
  ['morning', 'Morning'],
  ['afternoon', 'Afternoon'],
]

/** Badge variant per attendance status (matches ui Badge variants). */
export const ATTENDANCE_STATUS_VARIANT: Record<AttendanceStatus, 'success' | 'danger' | 'warning' | 'info'> = {
  present: 'success',
  absent: 'danger',
  late: 'warning',
  excused: 'info',
}
