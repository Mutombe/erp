// Shapes mirror the backend portal + payment-intent serializers.
// See backend/apps/portal and backend/apps/fees (PaymentIntent).

export type PortalKind = 'guardian' | 'student'

export interface Balance {
  currency: string
  amount: number
}

export interface StudentCard {
  id: number
  code: string
  name: string
  status: string
  photo: string | null
  class_name: string | null
  grade: string | null
  balances: Balance[]
  attendance_rate: number | null
}

export interface PortalProfile {
  id: number
  name: string
  code: string
  email: string
  phone: string
}

export interface PortalSchool {
  id: number
  code: string
  name: string
  slug: string
  logo: string | null
}

export interface PortalContext {
  kind: PortalKind
  profile: PortalProfile
  school: PortalSchool
  students: StudentCard[]
}

export interface InvoiceRow {
  id: number
  number: string
  date: string
  due_date: string | null
  currency: string
  total: number | string
  amount_paid: number | string
  balance: number | string
  status: string
}

export interface ReceiptRow {
  id: number
  number: string
  date: string
  currency: string
  amount: number | string
  payment_method: string
  reference: string
  unallocated_amount: number | string
  status: string
}

export interface StatementResponse {
  student: StudentCard
  invoices: InvoiceRow[]
  receipts: ReceiptRow[]
  balances: Balance[]
}

export interface AttRow {
  date: string
  session: string
  class_name: string
  status: string
  note: string
}

export interface AttendanceCounts {
  present: number
  absent: number
  late: number
  excused: number
}

export interface AttendanceResponse {
  student: StudentCard
  counts: AttendanceCounts
  total: number
  rate: number | null
  records: AttRow[]
}

export type PaymentIntentStatus = 'submitted' | 'confirmed' | 'rejected'

export interface IntentRow {
  id: number
  student: number
  student_code: string
  student_name: string
  guardian: number | null
  guardian_name: string | null
  date: string
  currency: string
  amount: string
  payment_method: string
  reference: string
  note: string
  status: PaymentIntentStatus
  receipt: number | null
  receipt_number: string | null
  review_note: string
  submitted_by: number | null
  submitted_by_email: string
  reviewed_by: number | null
  reviewed_at: string | null
  created_at: string
}
