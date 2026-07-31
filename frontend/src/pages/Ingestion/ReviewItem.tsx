import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowClockwise,
  ArrowSquareOut,
  CheckCircle,
  FloppyDisk,
  Plus,
  Prohibit,
  Trash,
  Tray,
  Warning,
  WarningCircle,
  File as FileIcon,
} from '@phosphor-icons/react'
import { ingestionApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { showToast, parseApiError } from '@/lib/toast'
import { useCan } from '@/hooks/useCan'
import {
  Button,
  ConfirmDialog,
  Input,
  PageHeader,
  RefreshingOverlay,
  refreshingContentClass,
  SkeletonCard,
  Textarea,
} from '@/components/ui'
import { cn } from '@/lib/utils'
import type { ApproveResponse, ExtractionLineItem, IngestionItem, JournalLeg } from '@/types/ingestion'
import {
  asPair,
  ConfidenceChip,
  confidencePct,
  DocTypeBadge,
  DOC_TYPE_LABELS,
  fmtMoney,
  humanizeField,
  IngestionStatusBadge,
  isVendorBill,
  lineageLabel,
  lineagePath,
} from './shared'

// ---------------------------------------------------------------------------
// Editable-draft model
// ---------------------------------------------------------------------------

interface ScalarField {
  value: string
  confidence: number | null
}

interface Draft {
  scalars: Record<string, ScalarField>
  order: string[]
  lineItems: ExtractionLineItem[]
  hasLineItems: boolean
}

function buildDraft(item: IngestionItem): Draft {
  const scalars: Record<string, ScalarField> = {}
  const order: string[] = []
  let lineItems: ExtractionLineItem[] = []
  const ex = item.extraction || {}

  for (const [key, raw] of Object.entries(ex)) {
    if (key === 'line_items') {
      const arr = asPair(raw).value
      lineItems = Array.isArray(arr) ? (arr as ExtractionLineItem[]).map((li) => ({ ...li })) : []
      continue
    }
    const p = asPair(raw)
    scalars[key] = { value: p.value == null ? '' : String(p.value), confidence: p.confidence }
    order.push(key)
  }

  return { scalars, order, lineItems, hasLineItems: isVendorBill(item.doc_type) || 'line_items' in ex }
}

/** Rebuild the extraction payload the backend expects from the current draft. */
function draftToExtraction(draft: Draft): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of draft.order) {
    const f = draft.scalars[key]
    out[key] = { value: f.value === '' ? null : f.value, confidence: f.confidence }
  }
  if (draft.hasLineItems) {
    out.line_items = draft.lineItems.map((li) => ({
      description: li.description ?? '',
      quantity: li.quantity ?? '',
      unit_price: li.unit_price ?? '',
      expense_hint: li.expense_hint ?? '',
    }))
  }
  return out
}

const EMPTY_LINE: ExtractionLineItem = { description: '', quantity: '1', unit_price: '', expense_hint: '' }

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReviewItem() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const canApprove = useCan('ingestion', 'approve')
  const canDelete = useCan('ingestion', 'delete')

  const [draft, setDraft] = useState<Draft | null>(null)
  const [confirmReject, setConfirmReject] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const { data: item, isFetching } = useQuery({
    queryKey: qk.ingestion.detail(id!),
    queryFn: () => ingestionApi.get(id!).then((r) => r.data as IngestionItem),
  })
  const isRefreshing = isFetching && !!item

  // Re-sync the editable draft whenever the item changes (upload, re-extract, save).
  useEffect(() => {
    if (item) setDraft(buildDraft(item))
  }, [item?.updated_at, item?.doc_type]) // eslint-disable-line react-hooks/exhaustive-deps

  const setDetail = (next: IngestionItem) => queryClient.setQueryData(qk.ingestion.detail(id!), next)

  // Invalidate the ledger-facing caches an approval touches.
  const invalidateLedger = () => {
    queryClient.invalidateQueries({ queryKey: qk.ingestion.all })
    queryClient.invalidateQueries({ queryKey: qk.journals.all })
    queryClient.invalidateQueries({ queryKey: qk.accounts.all })
    queryClient.invalidateQueries({ queryKey: qk.reports.all })
    queryClient.invalidateQueries({ queryKey: qk.vendorBills.all })
    queryClient.invalidateQueries({ queryKey: qk.suppliers.all })
    queryClient.invalidateQueries({ queryKey: qk.receipts.all })
    queryClient.invalidateQueries({ queryKey: qk.feeInvoices.all })
    queryClient.invalidateQueries({ queryKey: qk.bankAccounts.all })
  }

  const extractMutation = useMutation({
    mutationFn: () => ingestionApi.extract(id!).then((r) => r.data as IngestionItem),
    onSuccess: (data) => {
      setDetail(data)
      queryClient.invalidateQueries({ queryKey: qk.ingestion.lists() })
      showToast.success('Re-extracted')
    },
    onError: (error) => showToast.error(parseApiError(error, 'Extraction failed')),
  })

  // A freshly uploaded item (status 'received') hasn't been read by the AI yet.
  // Kick off extraction once on first view — the upload endpoint returns
  // instantly and delegates the slow/optional AI step here, where a failure just
  // leaves the item in needs_review for manual entry.
  const [autoExtractTried, setAutoExtractTried] = useState(false)
  useEffect(() => {
    if (item?.status === 'received' && !autoExtractTried && !extractMutation.isPending) {
      setAutoExtractTried(true)
      extractMutation.mutate()
    }
  }, [item?.status, autoExtractTried]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveMutation = useMutation({
    mutationFn: (extraction: Record<string, unknown>) =>
      ingestionApi.editExtraction(id!, { extraction }).then((r) => r.data as IngestionItem),
    onSuccess: (data) => {
      setDetail(data)
      queryClient.invalidateQueries({ queryKey: qk.ingestion.lists() })
      showToast.success('Changes saved — proposal rebuilt')
    },
    onError: (error) => showToast.error(parseApiError(error, 'Could not save changes')),
  })

  const approveMutation = useMutation({
    mutationFn: () => ingestionApi.approve(id!).then((r) => r.data as ApproveResponse),
    onSuccess: (data) => {
      setDetail(data)
      invalidateLedger()
      const type = data.lineage?.posted_document_type || data.posted_document_type
      showToast.success(`Approved & posted as ${lineageLabel(type)}`)
    },
    onError: (error) => showToast.error(parseApiError(error, 'Could not approve')),
  })

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => ingestionApi.reject(id!, reason).then((r) => r.data as IngestionItem),
    onSuccess: (data) => {
      setDetail(data)
      queryClient.invalidateQueries({ queryKey: qk.ingestion.lists() })
      showToast.success('Document rejected')
    },
    onError: (error) => showToast.error(parseApiError(error, 'Could not reject')),
  })

  const deleteMutation = useMutation({
    mutationFn: () => ingestionApi.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.ingestion.all })
      showToast.success('Document deleted')
      navigate('/app/ingestion')
    },
    onError: (error) => showToast.error(parseApiError(error, 'Could not delete')),
  })

  if (!item || !draft) return <SkeletonCard />

  const locked = item.status === 'posted' || item.status === 'rejected'
  const proposed = item.proposed || {}
  const gatePassed = !!proposed.gate_passed
  const problems: string[] = Array.isArray(proposed.problems) ? proposed.problems : []
  const legs: JournalLeg[] = Array.isArray(proposed.journal_preview) ? proposed.journal_preview : []

  const setScalar = (key: string, value: string) =>
    setDraft((d) => (d ? { ...d, scalars: { ...d.scalars, [key]: { ...d.scalars[key], value } } } : d))

  const setLine = (idx: number, patch: Partial<ExtractionLineItem>) =>
    setDraft((d) => {
      if (!d) return d
      const lineItems = d.lineItems.map((li, i) => (i === idx ? { ...li, ...patch } : li))
      return { ...d, lineItems }
    })

  const addLine = () => setDraft((d) => (d ? { ...d, lineItems: [...d.lineItems, { ...EMPTY_LINE }] } : d))
  const removeLine = (idx: number) =>
    setDraft((d) => (d ? { ...d, lineItems: d.lineItems.filter((_, i) => i !== idx) } : d))

  const save = () => saveMutation.mutate(draftToExtraction(draft))

  return (
    <div className="space-y-6">
      <PageHeader
        title={item.original_filename || `Document #${item.id}`}
        description={`${DOC_TYPE_LABELS[item.doc_type] ?? item.doc_type} · uploaded ${item.created_at?.slice(0, 10)}`}
        icon={Tray}
        backLink="/app/ingestion"
        actions={
          <div className="flex items-center gap-3">
            <IngestionStatusBadge status={item.status} />
          </div>
        }
      />

      {/* Lifecycle banners */}
      {item.status === 'posted' && <PostedBanner item={item} />}
      {item.status === 'rejected' && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm dark:border-red-900/40 dark:bg-red-900/20">
          <Prohibit className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-700 dark:text-red-300">This document was rejected</p>
            {item.rejection_reason && (
              <p className="text-red-600 dark:text-red-300/80 mt-0.5">{item.rejection_reason}</p>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: source preview */}
        <SourcePreview item={item} />

        {/* Right: extraction + proposal */}
        <div className="relative space-y-6">
          <RefreshingOverlay active={isRefreshing} />
          <div className={refreshingContentClass(isRefreshing, 'space-y-6')}>
            {/* Extracted fields */}
            <section className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900">
              <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 dark:border-slate-700">
                <h2 className="text-sm font-semibold text-gray-800 dark:text-slate-200">Extracted fields</h2>
                {!locked && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => extractMutation.mutate()}
                      loading={extractMutation.isPending}
                    >
                      <ArrowClockwise className="w-4 h-4 mr-1.5" /> Re-extract
                    </Button>
                    <Button size="sm" onClick={save} loading={saveMutation.isPending}>
                      <FloppyDisk className="w-4 h-4 mr-1.5" /> Save changes
                    </Button>
                  </div>
                )}
              </header>

              <div className="p-4 space-y-3">
                {draft.order.length === 0 && !draft.hasLineItems && (
                  <p className="text-sm text-gray-500 dark:text-slate-400">
                    No fields to review for this document type.
                  </p>
                )}

                {draft.order.map((key) => {
                  const f = draft.scalars[key]
                  const hasValue = f.value.trim() !== ''
                  return (
                    <div key={key} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-xs font-medium text-gray-600 dark:text-slate-400">
                          {humanizeField(key)}
                        </label>
                        <ConfidenceChip confidence={f.confidence} hasValue={hasValue} />
                      </div>
                      <Input
                        value={f.value}
                        onChange={(e) => setScalar(key, e.target.value)}
                        disabled={locked}
                        placeholder="—"
                      />
                    </div>
                  )
                })}

                {draft.hasLineItems && (
                  <LineItemsEditor
                    lines={draft.lineItems}
                    locked={locked}
                    onChange={setLine}
                    onAdd={addLine}
                    onRemove={removeLine}
                  />
                )}
              </div>
            </section>

            {/* Proposed document + journal preview */}
            <ProposalPanel item={item} legs={legs} problems={problems} gatePassed={gatePassed} />

            {/* Actions */}
            {!locked && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                {canDelete && (
                  <Button
                    variant="outline"
                    onClick={() => setConfirmDelete(true)}
                    className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-900/20"
                  >
                    <Trash className="w-4 h-4 mr-1.5" /> Delete
                  </Button>
                )}
                <div className="flex items-center gap-3">
                  {canApprove && (
                    <Button variant="secondary" onClick={() => setConfirmReject(true)}>
                      <Prohibit className="w-4 h-4 mr-1.5" /> Reject
                    </Button>
                  )}
                  {canApprove && (
                    <Button
                      variant="success"
                      onClick={() => approveMutation.mutate()}
                      loading={approveMutation.isPending}
                      disabled={!gatePassed}
                      title={gatePassed ? undefined : 'Resolve the problems below before posting'}
                    >
                      <CheckCircle className="w-4 h-4 mr-1.5" /> Approve &amp; Post
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reject dialog */}
      <ConfirmDialog
        open={confirmReject}
        onClose={() => setConfirmReject(false)}
        onConfirm={() => {
          setConfirmReject(false)
          rejectMutation.mutate(rejectReason)
        }}
        title="Reject this document?"
        variant="danger"
        confirmText="Reject"
        message={
          <div className="space-y-2">
            <p>It will be marked rejected and skipped. This does not post anything to the ledger.</p>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason (optional)"
              rows={3}
            />
          </div>
        }
      />

      {/* Delete dialog */}
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false)
          deleteMutation.mutate()
        }}
        title="Delete this document?"
        variant="danger"
        confirmText="Delete"
        message="The uploaded document and its draft are removed. Posted documents cannot be deleted."
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Source preview (left column)
// ---------------------------------------------------------------------------

function SourcePreview({ item }: { item: IngestionItem }) {
  const mime = (item.mime_type || '').toLowerCase()
  const isImage = mime.startsWith('image/')
  const isPdf = mime.includes('pdf') || (item.original_filename || '').toLowerCase().endsWith('.pdf')

  return (
    <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 dark:border-slate-700">
        <div className="flex items-center gap-2 min-w-0">
          <FileIcon className="w-4 h-4 text-gray-400 shrink-0" />
          <span className="truncate text-sm font-medium text-gray-800 dark:text-slate-200">
            {item.original_filename || `Document #${item.id}`}
          </span>
          <DocTypeBadge docType={item.doc_type} />
        </div>
        {item.file && (
          <a
            href={item.file}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline shrink-0"
          >
            Open <ArrowSquareOut className="w-3.5 h-3.5" />
          </a>
        )}
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-3 text-xs border-b border-gray-100 dark:border-slate-700">
        <div>
          <span className="block text-gray-400 dark:text-slate-500">Source</span>
          <span className="capitalize text-gray-700 dark:text-slate-300">{item.source}</span>
        </div>
        <div>
          <span className="block text-gray-400 dark:text-slate-500">Status</span>
          <IngestionStatusBadge status={item.status} />
        </div>
        <div>
          <span className="block text-gray-400 dark:text-slate-500">Confidence</span>
          <span className="tabular-nums text-gray-700 dark:text-slate-300">{confidencePct(item.confidence)}</span>
        </div>
        <div>
          <span className="block text-gray-400 dark:text-slate-500">Currency</span>
          <span className="text-gray-700 dark:text-slate-300">{item.target_currency}</span>
        </div>
      </div>

      <div className="p-4">
        {!item.file ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-gray-400 dark:text-slate-500">
            <FileIcon className="w-8 h-8" />
            <p className="text-sm">No file attached</p>
          </div>
        ) : isImage ? (
          <img
            src={item.file}
            alt={item.original_filename || 'Document'}
            className="w-full max-h-[640px] object-contain rounded-lg border border-gray-100 dark:border-slate-700"
          />
        ) : isPdf ? (
          <div className="space-y-2">
            <embed src={item.file} type="application/pdf" className="w-full h-[640px] rounded-lg border border-gray-100 dark:border-slate-700" />
            <a
              href={item.file}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
            >
              Open PDF in a new tab <ArrowSquareOut className="w-3.5 h-3.5" />
            </a>
          </div>
        ) : (
          <a
            href={item.file}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-4 py-3 rounded-lg border border-gray-200 dark:border-slate-700 text-sm text-primary-600 dark:text-primary-400 hover:bg-gray-50 dark:hover:bg-slate-800"
          >
            <FileIcon className="w-5 h-5" /> Download {item.original_filename || 'file'}
          </a>
        )}

        {item.notes && (
          <p className="mt-3 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2 whitespace-pre-wrap">
            {item.notes}
          </p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Line-item editor (vendor bills)
// ---------------------------------------------------------------------------

function LineItemsEditor({
  lines,
  locked,
  onChange,
  onAdd,
  onRemove,
}: {
  lines: ExtractionLineItem[]
  locked: boolean
  onChange: (idx: number, patch: Partial<ExtractionLineItem>) => void
  onAdd: () => void
  onRemove: (idx: number) => void
}) {
  const cell =
    'w-full px-2.5 py-1.5 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-50 dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200 dark:disabled:bg-slate-800'
  return (
    <div className="pt-2 space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-600 dark:text-slate-400">Line items</label>
        {!locked && (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
          >
            <Plus className="w-3.5 h-3.5" /> Add line
          </button>
        )}
      </div>

      {lines.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-slate-500">No line items — a single line is inferred from the total.</p>
      ) : (
        <div className="space-y-2">
          {lines.map((li, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-1.5 items-center">
              <input
                className={cn(cell, 'col-span-5')}
                value={String(li.description ?? '')}
                onChange={(e) => onChange(idx, { description: e.target.value })}
                disabled={locked}
                placeholder="Description"
              />
              <input
                className={cn(cell, 'col-span-2 text-right tabular-nums')}
                value={String(li.quantity ?? '')}
                onChange={(e) => onChange(idx, { quantity: e.target.value })}
                disabled={locked}
                placeholder="Qty"
                inputMode="decimal"
              />
              <input
                className={cn(cell, 'col-span-2 text-right tabular-nums')}
                value={String(li.unit_price ?? '')}
                onChange={(e) => onChange(idx, { unit_price: e.target.value })}
                disabled={locked}
                placeholder="Price"
                inputMode="decimal"
              />
              <input
                className={cn(cell, 'col-span-2')}
                value={String(li.expense_hint ?? '')}
                onChange={(e) => onChange(idx, { expense_hint: e.target.value })}
                disabled={locked}
                placeholder="Acct hint"
              />
              {!locked && (
                <button
                  type="button"
                  onClick={() => onRemove(idx)}
                  className="col-span-1 flex justify-center p-1 text-gray-400 hover:text-red-500"
                  aria-label="Remove line"
                >
                  <Trash className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Proposal panel (document summary + journal preview + problems)
// ---------------------------------------------------------------------------

function ProposalPanel({
  item,
  legs,
  problems,
  gatePassed,
}: {
  item: IngestionItem
  legs: JournalLeg[]
  problems: string[]
  gatePassed: boolean
}) {
  const p = item.proposed || {}
  const balanced = !!p.balanced

  const totalDr = useMemo(() => legs.reduce((s, l) => s + (parseFloat(l.dr) || 0), 0), [legs])
  const totalCr = useMemo(() => legs.reduce((s, l) => s + (parseFloat(l.cr) || 0), 0), [legs])

  return (
    <section className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900">
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 dark:border-slate-700">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-slate-200">Proposed posting</h2>
        {legs.length > 0 && (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
              balanced
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
            )}
          >
            {balanced ? <CheckCircle className="w-3.5 h-3.5" /> : <WarningCircle className="w-3.5 h-3.5" />}
            {balanced ? 'Balanced' : 'Out of balance'}
          </span>
        )}
      </header>

      <div className="p-4 space-y-4">
        <DocumentSummary item={item} />

        {/* Journal preview */}
        {legs.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-slate-800 text-left text-[11px] uppercase tracking-wider text-gray-500 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2">Account</th>
                  <th className="px-3 py-2 text-right">Debit</th>
                  <th className="px-3 py-2 text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {legs.map((leg, i) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-slate-700/50">
                    <td className="px-3 py-2 font-mono text-xs text-gray-700 dark:text-slate-300">
                      {leg.account ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {parseFloat(leg.dr) ? fmtMoney(leg.dr) : ''}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {parseFloat(leg.cr) ? fmtMoney(leg.cr) : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 dark:bg-slate-800 font-semibold">
                <tr>
                  <td className="px-3 py-2 text-xs uppercase text-gray-500 dark:text-slate-400">Totals</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totalDr)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totalCr)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-slate-400">
            No journal preview yet — fill in the required fields and save to build the proposal.
          </p>
        )}

        {/* Problems / warnings */}
        {problems.length > 0 ? (
          <ul className="space-y-1.5">
            {problems.map((prob, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2"
              >
                <Warning className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{prob}</span>
              </li>
            ))}
          </ul>
        ) : (
          gatePassed && (
            <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
              <CheckCircle className="w-4 h-4" /> Ready to post.
            </p>
          )
        )}
      </div>
    </section>
  )
}

/** Doc-type-aware key facts for the proposed document. */
function DocumentSummary({ item }: { item: IngestionItem }) {
  const p = item.proposed || {}
  const rows: Array<{ label: string; value: ReactNode }> = []

  if (item.doc_type === 'vendor_bill') {
    rows.push({
      label: 'Supplier',
      value: (
        <span>
          {p.supplier?.name || '—'}
          {p.supplier?.will_be_created && (
            <span className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
              will be created
            </span>
          )}
        </span>
      ),
    })
    if (p.supplier_reference) rows.push({ label: 'Reference', value: p.supplier_reference })
    rows.push({ label: 'Date / Due', value: `${p.date ?? '—'} → ${p.due_date ?? '—'}` })
    rows.push({ label: 'Total', value: <span className="tabular-nums font-semibold">{fmtMoney(p.total)} {p.currency}</span> })
  } else if (item.doc_type === 'fee_receipt') {
    rows.push({
      label: 'Student',
      value: (
        <span>
          {p.student?.name || '—'}
          {p.student?.code ? ` (${p.student.code})` : ''}
          {p.student && !p.student.found && (
            <span className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300">
              {p.student.ambiguous ? 'ambiguous' : 'not found'}
            </span>
          )}
        </span>
      ),
    })
    rows.push({ label: 'Amount', value: <span className="tabular-nums font-semibold">{fmtMoney(p.amount)} {p.currency}</span> })
    rows.push({ label: 'Method', value: <span className="capitalize">{(p.method ?? '').replace(/_/g, ' ') || '—'}</span> })
    if (p.reference) rows.push({ label: 'Reference', value: p.reference })
    rows.push({ label: 'Bank / Date', value: `${p.bank_account_code ?? '—'} · ${p.date ?? '—'}` })
  } else if (item.doc_type === 'expense') {
    rows.push({ label: 'Description', value: p.description || '—' })
    rows.push({ label: 'Amount', value: <span className="tabular-nums font-semibold">{fmtMoney(p.amount)} {p.currency}</span> })
    rows.push({ label: 'Expense acct', value: <span className="font-mono text-xs">{p.expense_account_code ?? '—'}</span> })
    rows.push({ label: 'Bank / Date', value: `${p.bank_account_code ?? '—'} · ${p.date ?? '—'}` })
  } else {
    rows.push({ label: 'Type', value: 'Unsupported document type for posting.' })
  }

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
      {rows.map((r, i) => (
        <div key={i} className={cn(i === 0 && 'col-span-2')}>
          <span className="block text-xs text-gray-400 dark:text-slate-500">{r.label}</span>
          <span className="text-gray-800 dark:text-slate-200">{r.value}</span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Posted banner with lineage link
// ---------------------------------------------------------------------------

function PostedBanner({ item }: { item: IngestionItem }) {
  const path = item.posted_document_type
    ? lineagePath(item.posted_document_type, item.posted_document_id)
    : null
  return (
    <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm dark:border-emerald-900/40 dark:bg-emerald-900/20">
      <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
      <div>
        <p className="font-medium text-emerald-700 dark:text-emerald-300">Posted to the ledger</p>
        {path ? (
          <Link to={path} className="text-emerald-600 dark:text-emerald-300/90 hover:underline">
            View the created {lineageLabel(item.posted_document_type)} →
          </Link>
        ) : (
          <p className="text-emerald-600 dark:text-emerald-300/80">
            {item.posted_document_type} #{item.posted_document_id}
          </p>
        )}
      </div>
    </div>
  )
}
