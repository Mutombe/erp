// Shapes mirror backend/apps/fees/serializers.py

export interface FeeCategory {
  id: number
  code: string
  name: string
  income_account: number
  deferred_account: number | null
  pocket_order: number
  is_active: boolean
}

export interface FeeStructure {
  id: number
  academic_year: number
  term: number
  term_name: string
  grade: number
  grade_name: string
  fee_category: number
  fee_category_code: string
  amount: string
  currency: string
  applies_to: 'all' | 'day' | 'boarder'
  is_mandatory: boolean
}

export type BillingScope = 'whole_school' | 'grades' | 'classes' | 'students'

export interface BillingRun {
  id: number
  number: string
  term: number
  term_name: string
  currency: string
  date: string
  due_date: string | null
  scope: BillingScope
  grades: number[]
  classes: number[]
  students: number[]
  status: 'draft' | 'previewed' | 'running' | 'completed' | 'failed'
  invoices_created: number
  total_billed: string
  error_message: string
  task_id: string | null
  created_by: number | null
  created_at: string
}

// Shape of POST /fees/billing-runs/:id/preview/
export interface BillingPreviewLine {
  fee_category: string
  amount: string | number
  discount: string | number
}

export interface BillingPreviewRow {
  student_id: number
  student_code: string
  student_name: string
  grade: string
  already_billed: boolean
  lines: BillingPreviewLine[]
  total: string | number
}

export interface BillingPreview {
  rows: BillingPreviewRow[]
  total_to_bill: string | number
  count: number
}

export interface FeeInvoiceLine {
  id: number
  fee_category: number
  fee_category_code: string
  description: string
  amount: string
  bursary_award: number | null
  discount_amount: string
  allocated_amount: string
}

export interface FeeInvoice {
  id: number
  number: string
  student: number
  student_code: string
  student_name: string
  enrollment: number | null
  term: number
  billing_run: number | null
  date: string
  due_date: string | null
  currency: string
  exchange_rate: string
  subtotal: string
  discount_total: string
  total: string
  amount_paid: string
  balance: string | number
  status: 'draft' | 'posted' | 'partial' | 'paid' | 'cancelled'
  journal: number | null
  journal_number: string | null
  notes: string
  custom_fields: Record<string, unknown>
  lines: FeeInvoiceLine[]
  created_by: number | null
  created_at: string
}

export interface ReceiptAllocation {
  id: number
  invoice: number
  invoice_number: string
  amount: string
  fx_difference_base: string
}

export interface Receipt {
  id: number
  number: string
  student: number
  student_code: string
  student_name: string
  payer_guardian: number | null
  date: string
  bank_account: number
  currency: string
  exchange_rate: string
  amount: string
  payment_method: 'cash' | 'bank_transfer' | 'ecocash' | 'card' | 'cheque'
  reference: string
  status: 'posted' | 'reversed'
  journal: number | null
  journal_number: string | null
  unallocated_amount: string
  notes: string
  allocations: ReceiptAllocation[]
  created_by: number | null
  created_at: string
}

export interface CreditNoteLine {
  id: number
  fee_category: number
  fee_category_code: string
  amount: string
}

export interface CreditNote {
  id: number
  number: string
  student: number
  student_code: string
  student_name: string
  invoice: number | null
  invoice_number: string | null
  date: string
  currency: string
  reason: string
  total: string
  status: 'draft' | 'posted'
  journal: number | null
  journal_number: string | null
  lines: CreditNoteLine[]
  created_by: number | null
  created_at: string
}

export type BursaryAwardType = 'percent' | 'fixed'

export interface BursaryAward {
  id: number
  student: number
  student_code: string
  student_name: string
  fee_category: number | null
  fee_category_code: string | null
  academic_year: number | null
  term: number | null
  award_type: BursaryAwardType
  value: string
  funder: string
  notes: string
  is_active: boolean
}

export const PAYMENT_METHODS = [
  ['cash', 'Cash'],
  ['bank_transfer', 'Bank transfer'],
  ['ecocash', 'EcoCash'],
  ['card', 'Card'],
  ['cheque', 'Cheque'],
] as const

export const BILLING_SCOPE_OPTIONS: [BillingScope, string][] = [
  ['whole_school', 'Whole school'],
  ['grades', 'By grade'],
  ['classes', 'By class'],
  ['students', 'Specific students'],
]

export const APPLIES_TO_OPTIONS = [
  ['all', 'All students'],
  ['day', 'Day scholars'],
  ['boarder', 'Boarders'],
] as const

/** Format a decimal-ish API value as a money string (no currency symbol). */
export function fmtMoney(value: string | number | null | undefined): string {
  return Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
