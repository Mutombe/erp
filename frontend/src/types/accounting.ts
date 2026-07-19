export interface Account {
  id: number
  code: string
  name: string
  account_type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
  account_subtype: string
  report_group: string
  parent: number | null
  currency: string
  description: string
  is_system: boolean
  is_active: boolean
  allow_manual_journal: boolean
  current_balance: string
  normal_balance: 'debit' | 'credit'
}

export interface JournalLine {
  id: number
  account: number
  account_code: string
  account_name: string
  debit_amount: string
  credit_amount: string
  debit_base: string
  credit_base: string
  sub_account: number | null
  sub_account_code: string | null
  bank_account: number | null
  description: string
  source_type: string
  source_id: number | null
}

export interface Journal {
  id: number
  number: string
  journal_type: string
  date: string
  description: string
  reference: string
  status: 'draft' | 'posted' | 'reversed'
  currency: string
  exchange_rate: string
  reversed_by: number | null
  reversed_by_number: string | null
  reversal_reason: string
  source_type: string
  source_id: number | null
  source_ref: string
  posted_by_email: string | null
  posted_at: string | null
  created_at: string
  lines: JournalLine[]
  total_debit: string
  total_credit: string
}

export interface GLEntry {
  id: number
  journal_id: number
  journal_number: string
  account: number
  account_code: string
  account_name: string
  date: string
  description: string
  debit_amount: string
  credit_amount: string
  debit_base: string
  credit_base: string
  balance: string
  currency: string
  exchange_rate: string
  source_type: string
  source_id: number | null
  source_ref: string
}

export interface BankAccount {
  id: number
  code: string
  name: string
  account_type: 'bank' | 'mobile_money' | 'cash'
  bank_name: string
  branch: string
  account_number: string
  currency: string
  gl_account: number
  gl_account_code: string
  book_balance: string
  bank_balance: string
  is_default: boolean
  is_active: boolean
}

export interface Paginated<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

/** Route a journal's source document to its detail page. */
export function sourceDocPath(sourceType: string, sourceId: number | null): string | null {
  if (!sourceId) return null
  const map: Record<string, string> = {
    'fees.FeeInvoice': '/app/fee-invoices',
    'fees.Receipt': '/app/receipts',
    'fees.CreditNote': '/app/fee-invoices',
    'procurement.VendorBill': '/app/vendor-bills',
    'procurement.GoodsReceivedNote': '/app/grns',
    'procurement.SupplierPayment': '/app/supplier-payments',
    'inventory.StockMove': '/app/stock-moves',
    'assets.Asset': '/app/fixed-assets',
    'assets.DepreciationRun': '/app/fixed-assets',
    'accounting.OpeningBalance': '/app/journals',
  }
  const base = map[sourceType]
  return base ? `${base}/${sourceId}` : null
}
