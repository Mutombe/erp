export interface Supplier {
  id: number
  code: string
  name: string
  contact_person: string
  phone: string
  email: string
  address: string
  tax_number: string
  default_currency: string
  payment_terms_days: number
  is_active: boolean
  custom_fields: Record<string, unknown> | null
  created_at: string
}

export type PurchaseOrderStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'partially_received'
  | 'received'
  | 'closed'
  | 'cancelled'

export const PO_STATUSES: PurchaseOrderStatus[] = [
  'draft',
  'submitted',
  'approved',
  'partially_received',
  'received',
  'closed',
  'cancelled',
]

export interface POLine {
  id: number
  item: number | null
  item_code: string | null
  description: string
  expense_account: number | null
  quantity: string
  unit_price: string
  qty_received: string
}

export interface PurchaseOrder {
  id: number
  number: string
  supplier: number
  supplier_name: string
  date: string
  expected_date: string | null
  currency: string
  status: PurchaseOrderStatus
  total: string | number
  notes: string
  lines: POLine[]
  approved_by: number | null
  approved_at: string | null
  created_by: number | null
  created_at: string
}

export interface GRNLine {
  id: number
  po_line: number
  item_code: string | null
  quantity: string
  unit_cost: string
  unit_cost_base: string
}

export interface GRN {
  id: number
  number: string
  po: number
  po_number: string
  warehouse: number
  warehouse_code: string
  date: string
  received_by: number | null
  status: 'draft' | 'posted'
  journal: number | null
  journal_number: string | null
  lines: GRNLine[]
  created_at: string
}

export type VendorBillStatus = 'draft' | 'posted' | 'partial' | 'paid' | 'cancelled'

export const BILL_STATUSES: VendorBillStatus[] = ['draft', 'posted', 'partial', 'paid', 'cancelled']

export interface VendorBillLine {
  id: number
  grn_line: number | null
  expense_account: number | null
  item: number | null
  description: string
  quantity: string
  unit_price: string
}

export interface VendorBill {
  id: number
  number: string
  supplier: number
  supplier_name: string
  supplier_reference: string
  po: number | null
  po_number: string | null
  date: string
  due_date: string
  currency: string
  exchange_rate: string
  total: string
  amount_paid: string
  balance: string
  status: VendorBillStatus
  journal: number | null
  journal_number: string | null
  notes: string
  lines: VendorBillLine[]
  created_by: number | null
  created_at: string
}

export interface PaymentAllocation {
  id: number
  bill: number
  bill_number: string
  amount: string
  fx_difference_base: string
}

export interface SupplierPayment {
  id: number
  number: string
  supplier: number
  supplier_name: string
  bank_account: number
  date: string
  currency: string
  exchange_rate: string
  amount: string
  reference: string
  status: 'posted' | 'reversed'
  journal: number | null
  journal_number: string | null
  notes: string
  allocations: PaymentAllocation[]
  created_by: number | null
  created_at: string
}

/** Format a decimal-string money amount with 2dp thousands grouping. */
export function money(value: string | number | null | undefined): string {
  const n = typeof value === 'number' ? value : parseFloat(value ?? '0')
  if (!isFinite(n)) return '0.00'
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
