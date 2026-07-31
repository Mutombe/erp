import type { BadgeVariant } from '@/components/ui/Badge'

export interface ItemCategory {
  id: number
  name: string
  inventory_account: number
  consumption_expense_account: number
  is_active: boolean
}

export type ItemType = 'stockable' | 'consumable' | 'service'

export interface Item {
  id: number
  code: string
  name: string
  category: number | null
  category_name: string | null
  uom: string
  item_type: ItemType
  avg_cost: string
  qty_on_hand: string
  reorder_level: string
  reorder_qty: string
  track_lots: boolean
  barcode: string
  is_low_stock: boolean
  suggested_order_qty: string
  is_active: boolean
  created_at: string
}

export interface Warehouse {
  id: number
  code: string
  name: string
  location: string
  storekeeper: number | null
  is_active: boolean
}

export interface StockLevel {
  id: number
  item: number
  item_code: string
  item_name: string
  warehouse: number
  warehouse_code: string
  quantity: string
}

/**
 * Consumption dimension for stock issues. When a department carries its own
 * expense account, issues to it debit that account instead of the item
 * category's default consumption expense.
 */
export interface Department {
  id: number
  code: string
  name: string
  description: string
  expense_account: number | null
  expense_account_code: string | null
  expense_account_name: string | null
  head_name: string
  is_active: boolean
  stock_move_count: number
  created_at: string
}

export type MoveType = 'receipt' | 'issue' | 'transfer' | 'adjustment_in' | 'adjustment_out'

export interface StockMove {
  id: number
  number: string
  move_type: MoveType
  item: number
  item_code: string
  item_name: string
  warehouse_from: number | null
  warehouse_from_code: string | null
  warehouse_to: number | null
  warehouse_to_code: string | null
  quantity: string
  unit_cost: string
  total_cost_base: string
  date: string
  department: number | null
  department_name: string | null
  department_code: string | null
  reason: string
  source_type: string
  source_id: number | null
  journal: number | null
  journal_number: string | null
  status: string
  created_by: number | null
  created_at: string
}

export const MOVE_TYPE_LABELS: Record<MoveType, string> = {
  receipt: 'Receipt',
  issue: 'Issue',
  transfer: 'Transfer',
  adjustment_in: 'Adjustment in',
  adjustment_out: 'Adjustment out',
}

export const MOVE_TYPE_VARIANTS: Record<MoveType, BadgeVariant> = {
  receipt: 'success',
  issue: 'warning',
  transfer: 'info',
  adjustment_in: 'purple',
  adjustment_out: 'danger',
}

/** Low-stock: a reorder level is set and on-hand has fallen to or below it. */
export function isLowStock(item: Item): boolean {
  const reorder = parseFloat(item.reorder_level)
  return reorder > 0 && parseFloat(item.qty_on_hand) <= reorder
}

// ---------------------------------------------------------------------------
// Lots & expiry (Phase 5B)
// ---------------------------------------------------------------------------

export interface StockLot {
  id: number
  item: number
  item_code: string
  item_name: string
  warehouse: number
  warehouse_code: string
  lot_code: string
  expiry_date: string | null
  quantity: string
  received_date: string
  created_at: string
}

/** Days-to-expiry threshold that flags a lot as urgent (highlighted red). */
export const LOT_EXPIRY_WARN_DAYS = 30

/** Whole days from today until `expiry_date` (negative if already expired). */
export function daysUntil(date: string | null): number | null {
  if (!date) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${date}T00:00:00`)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

// ---------------------------------------------------------------------------
// Requisitions (Phase 5B)
// ---------------------------------------------------------------------------

export type RequisitionStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'issued'
  | 'partially_issued'

export interface RequisitionLine {
  id: number
  item: number
  item_code: string
  item_name: string
  qty_requested: string
  qty_approved: string
  qty_issued: string
}

export interface Requisition {
  id: number
  number: string
  warehouse: number
  warehouse_code: string
  department: number | null
  department_name: string | null
  date: string
  status: RequisitionStatus
  note: string
  review_note: string
  requested_by: number | null
  requested_by_email: string | null
  reviewed_by: number | null
  reviewed_at: string | null
  lines: RequisitionLine[]
  created_at: string
}

export const REQUISITION_STATUS_LABELS: Record<RequisitionStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
  issued: 'Issued',
  partially_issued: 'Partially issued',
}

export const REQUISITION_STATUS_VARIANTS: Record<RequisitionStatus, BadgeVariant> = {
  draft: 'default',
  submitted: 'warning',
  approved: 'info',
  rejected: 'danger',
  issued: 'success',
  partially_issued: 'purple',
}

export const REQUISITION_STATUS_OPTIONS = (
  Object.keys(REQUISITION_STATUS_LABELS) as RequisitionStatus[]
).map((value) => ({ value, label: REQUISITION_STATUS_LABELS[value] }))
