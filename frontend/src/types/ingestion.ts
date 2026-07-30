// Types for the document-ingestion inbox.
//
// Shapes mirror apps/ingestion (models.py + services.build_proposal):
//   - `extraction` is a per-field map `{field: {value, confidence}}`, except
//     `line_items` (vendor bills) which is an array of plain objects. Human
//     edits may leave bare values, so consumers must tolerate both.
//   - `proposed` is FLAT: the document preview keys live at the top level
//     alongside `journal_preview` (legs `{account, dr, cr}`) and the gate flags
//     `balanced` / `problems` / `gate_passed`.

export type IngestionDocType = 'vendor_bill' | 'fee_receipt' | 'expense' | 'other'

export type IngestionStatus =
  | 'received'
  | 'extracted'
  | 'needs_review'
  | 'approved'
  | 'posted'
  | 'rejected'

/** A single extracted field — AI output or human-edited. */
export interface FieldPair {
  value: unknown
  confidence: number | null
}

/** Per-field extraction map. `line_items` may be an array or a {value} wrapper. */
export type Extraction = Record<string, unknown>

/** A vendor-bill line as it appears inside `extraction.line_items`. */
export interface ExtractionLineItem {
  description?: string
  quantity?: string | number | null
  unit_price?: string | number | null
  expense_hint?: string | null
  [key: string]: unknown
}

/** A proposed journal leg (preview only — never posted from here). */
export interface JournalLeg {
  account: string | null
  dr: string
  cr: string
  description?: string
}

/** The proposal built from the (possibly edited) extraction. Flat by design. */
export interface Proposed {
  doc_type?: string
  balanced?: boolean
  problems?: string[]
  gate_passed?: boolean
  journal_preview?: JournalLeg[]
  date?: string
  due_date?: string
  currency?: string
  total?: string
  amount?: string

  // vendor_bill
  supplier?: {
    id: number | null
    name: string
    tax_number: string
    will_be_created: boolean
  }
  supplier_will_be_created?: boolean
  supplier_reference?: string
  lines?: Array<{
    description: string
    quantity: string
    unit_price: string
    amount: string
    expense_account_code: string | null
  }>

  // fee_receipt
  student?: {
    id: number | null
    code: string | null
    name: string
    found: boolean
    ambiguous: boolean
  }
  bank_account_code?: string | null
  method?: string
  reference?: string

  // expense
  description?: string
  expense_account_code?: string | null

  [key: string]: unknown
}

export interface IngestionItem {
  id: number
  doc_type: IngestionDocType
  source: string
  status: IngestionStatus
  file: string | null
  original_filename: string
  mime_type: string
  raw_text: string
  extraction: Extraction
  proposed: Proposed
  confidence: string | null
  notes: string
  target_currency: string
  posted_document_type: string
  posted_document_id: string
  rejection_reason: string
  created_by: number | null
  reviewed_by: number | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

/** Response from the approve action — item data plus a lineage pointer. */
export interface ApproveResponse extends IngestionItem {
  lineage?: {
    posted_document_type: string
    posted_document_id: string
  }
}
