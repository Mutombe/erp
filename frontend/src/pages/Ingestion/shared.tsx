// Shared presentational helpers for the ingestion inbox + review screens.
import { Badge, type BadgeVariant } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { FieldPair, IngestionDocType } from '@/types/ingestion'

// ---------------------------------------------------------------------------
// Doc type
// ---------------------------------------------------------------------------

export const DOC_TYPE_LABELS: Record<string, string> = {
  vendor_bill: 'Vendor bill',
  fee_receipt: 'Fee receipt',
  expense: 'Expense',
  other: 'Other',
}

export const DOC_TYPE_OPTIONS = [
  { value: 'vendor_bill', label: 'Vendor bill' },
  { value: 'fee_receipt', label: 'Fee receipt' },
  { value: 'expense', label: 'Expense' },
  { value: 'other', label: 'Other / unknown' },
]

const DOC_TYPE_VARIANT: Record<string, BadgeVariant> = {
  vendor_bill: 'info',
  fee_receipt: 'purple',
  expense: 'warning',
  other: 'default',
}

export function DocTypeBadge({ docType }: { docType: string }) {
  return (
    <Badge variant={DOC_TYPE_VARIANT[docType] ?? 'default'} size="sm">
      {DOC_TYPE_LABELS[docType] ?? docType}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

// Ingestion-specific palette (kept local so it never clashes with the shared
// StatusBadge, where e.g. `received` means a green procurement state).
const INGESTION_STATUS: Record<string, { variant: BadgeVariant; label: string }> = {
  received: { variant: 'warning', label: 'Received' },
  extracted: { variant: 'warning', label: 'Extracted' },
  needs_review: { variant: 'warning', label: 'Needs review' },
  approved: { variant: 'success', label: 'Approved' },
  posted: { variant: 'success', label: 'Posted' },
  rejected: { variant: 'danger', label: 'Rejected' },
}

export function IngestionStatusBadge({ status }: { status: string }) {
  const c = INGESTION_STATUS[status] ?? { variant: 'default' as BadgeVariant, label: status }
  return (
    <Badge variant={c.variant} dot>
      {c.label}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

/** Colored per-field confidence chip. Below-threshold or empty → "needs input". */
export function ConfidenceChip({
  confidence,
  hasValue,
}: {
  confidence: number | null
  hasValue: boolean
}) {
  const level = !hasValue
    ? 'empty'
    : (confidence ?? 0) >= 0.8
      ? 'high'
      : (confidence ?? 0) >= 0.5
        ? 'mid'
        : 'low'

  const cls: Record<string, string> = {
    high: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    mid: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    low: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    empty: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-300',
  }

  const label = hasValue ? `${Math.round((confidence ?? 0) * 100)}%` : 'needs input'
  return (
    <span
      className={cn(
        'inline-block shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium tabular-nums',
        cls[level]
      )}
    >
      {label}
    </span>
  )
}

/** Whole-item confidence as a percentage string, or a dash when absent. */
export function confidencePct(confidence: string | null): string {
  if (confidence == null || confidence === '') return '—'
  const n = parseFloat(confidence)
  if (Number.isNaN(n)) return '—'
  return `${Math.round(n * 100)}%`
}

// ---------------------------------------------------------------------------
// Field-pair tolerance ({value, confidence} OR bare value)
// ---------------------------------------------------------------------------

export function asPair(raw: unknown): FieldPair {
  if (
    raw != null &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    ('value' in (raw as object) || 'confidence' in (raw as object))
  ) {
    const r = raw as { value?: unknown; confidence?: unknown }
    return {
      value: r.value ?? null,
      confidence: typeof r.confidence === 'number' ? r.confidence : r.confidence == null ? null : Number(r.confidence),
    }
  }
  return { value: raw ?? null, confidence: raw == null ? null : 1 }
}

export function humanizeField(key: string): string {
  const spaced = key.replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

// ---------------------------------------------------------------------------
// Money + lineage
// ---------------------------------------------------------------------------

export function fmtMoney(value: unknown): string {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''))
  if (Number.isNaN(n)) return String(value ?? '—')
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Map a posted-document lineage type to its detail route, or null if unknown. */
export function lineagePath(type: string, id: string): string | null {
  switch (type) {
    case 'procurement.VendorBill':
      return `/app/vendor-bills/${id}`
    case 'fees.Receipt':
      return `/app/receipts/${id}`
    case 'accounting.Journal':
      return `/app/journals/${id}`
    default:
      return null
  }
}

export function lineageLabel(type: string): string {
  switch (type) {
    case 'procurement.VendorBill':
      return 'vendor bill'
    case 'fees.Receipt':
      return 'receipt'
    case 'accounting.Journal':
      return 'journal'
    default:
      return 'document'
  }
}

export const isVendorBill = (docType: IngestionDocType | string) => docType === 'vendor_bill'
