// Shapes mirror backend/apps/transfers/serializers.py

export type TransferKind = 'funds' | 'student'
export type TransferStatus = 'draft' | 'completed' | 'reversed'

export interface Transfer {
  id: number
  number: string
  kind: TransferKind
  from_school: number
  from_school_name: string
  to_school: number
  to_school_name: string
  date: string
  currency: string
  amount: string
  status: TransferStatus
  note: string
  from_bank: number | null
  to_bank: number | null
  from_student: number | null
  from_student_code: string | null
  from_student_name: string | null
  to_student: number | null
  to_student_code: string | null
  from_journal: number | null
  from_journal_number: string | null
  to_journal: number | null
  to_journal_number: string | null
  created_by: number | null
  created_at: string
}

/** GET /transfers/transfers/student-preview/?student=<id> — the net balance a
 *  pupil would carry across, per currency (positive = owes; negative = prepaid). */
export interface TransferStudentPreview {
  student: number
  student_name: string
  school: number
  balances: { currency: string; amount: string | number }[]
}

export const TRANSFER_KIND_OPTIONS = [
  { value: 'funds', label: 'Funds' },
  { value: 'student', label: 'Student' },
] as const

export const TRANSFER_STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'completed', label: 'Completed' },
  { value: 'reversed', label: 'Reversed' },
] as const

/** A bank account row as returned by the bank-accounts list (serialized with
 *  `__all__`, so it carries the `school` and `currency` we filter pickers by). */
export interface TransferBank {
  id: number
  code: string
  name: string
  currency: string
  school: number
  is_active: boolean
}
