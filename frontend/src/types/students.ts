// Shapes mirror backend/apps/students/serializers.py

export interface Term {
  id: number
  academic_year: number
  number: number
  name: string
  start_date: string
  end_date: string
  is_current: boolean
}

export interface AcademicYear {
  id: number
  name: string
  start_date: string
  end_date: string
  is_current: boolean
  terms: Term[]
}

export interface Grade {
  id: number
  name: string
  level: number
  section: string
}

export interface ClassRoom {
  id: number
  grade: number
  grade_name: string
  name: string
  academic_year: number
  teacher_name: string
  capacity: number | null
  student_count: number
}

export interface StudentBrief {
  id: number
  code: string
  first_name: string
  last_name: string
  full_name: string
  status: string
}

export interface StudentBalance {
  currency: string
  balance: string | number | null
}

export interface Student {
  id: number
  code: string
  first_name: string
  last_name: string
  full_name: string
  dob: string | null
  gender: string
  national_id_or_birth_cert: string
  admission_date: string | null
  status: 'applicant' | 'enrolled' | 'suspended' | 'graduated' | 'withdrawn'
  attendance_type: 'day' | 'boarder'
  photo: string | null
  medical_notes: string
  custom_fields: Record<string, unknown>
  current_class: string | null
  balances: StudentBalance[]
  created_at: string
  updated_at: string
}

export interface Guardian {
  id: number
  code: string
  first_name: string
  last_name: string
  full_name: string
  phone: string
  email: string
  address: string
  national_id: string
  employer: string
  students: StudentBrief[]
  created_at: string
}

export interface Enrollment {
  id: number
  student: number
  student_code: string
  student_name: string
  academic_year: number
  class_room: number
  class_room_name: string
  grade_name: string
  enrolled_date: string | null
  attendance_type: 'day' | 'boarder'
  status: 'active' | 'transferred' | 'completed' | 'withdrawn'
  created_at: string
}

// Shape of GET /reports/student-statement/:id/
export interface StatementRow {
  date: string
  category: string
  reference: string
  description: string
  debit: string | number
  credit: string | number
  balance: string | number
  journal_id: number | null
  source_type: string
  source_id: number | null
  source_ref: string
}

export interface StudentStatement {
  student: { id: number; code: string; name: string }
  currency: string
  start: string
  end: string
  opening_balance: string | number
  rows: StatementRow[]
  closing_balance: string | number
}

export const STUDENT_STATUSES = ['applicant', 'enrolled', 'suspended', 'graduated', 'withdrawn'] as const
export const ATTENDANCE_TYPES = [
  ['day', 'Day scholar'],
  ['boarder', 'Boarder'],
] as const
