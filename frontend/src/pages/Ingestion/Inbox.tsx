import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Tray, UploadSimple, FileArrowUp, File as FileIcon, X } from '@phosphor-icons/react'
import { ingestionApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { showToast, parseApiError } from '@/lib/toast'
import { usePagedList } from '@/hooks/usePaginatedQuery'
import { usePrefetchDetail } from '@/hooks/usePrefetch'
import { useUrlFilters, filtersToQuery, type FilterConfig } from '@/hooks/useUrlFilters'
import {
  Button,
  DataTable,
  FilterBar,
  Modal,
  ModalFooter,
  PageHeader,
  RefreshingOverlay,
  refreshingContentClass,
  Select,
  type Column,
} from '@/components/ui'
import { cn, formatDate } from '@/lib/utils'
import type { Paginated } from '@/types/accounting'
import type { IngestionItem } from '@/types/ingestion'
import { confidencePct, DocTypeBadge, DOC_TYPE_OPTIONS, IngestionStatusBadge } from './shared'

const PAGE_SIZE = 25

const STATUS_OPTIONS = [
  { value: 'received', label: 'Received' },
  { value: 'extracted', label: 'Extracted' },
  { value: 'needs_review', label: 'Needs review' },
  { value: 'approved', label: 'Approved' },
  { value: 'posted', label: 'Posted' },
  { value: 'rejected', label: 'Rejected' },
]

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD' },
  { value: 'ZWG', label: 'ZWG' },
]

const FILTER_CONFIG: FilterConfig = [
  { type: 'search', placeholder: 'Search filename, text, notes…' },
  { type: 'chips', field: 'status', label: 'Status', multi: true, options: STATUS_OPTIONS },
  { type: 'chips', field: 'doc_type', label: 'Type', multi: true, options: DOC_TYPE_OPTIONS },
  { type: 'dateRange', field: 'created_at', label: 'Uploaded' },
]

export default function Inbox() {
  const navigate = useNavigate()
  const filters = useUrlFilters(FILTER_CONFIG)
  const [page, setPage] = useState(1)
  const [uploadOpen, setUploadOpen] = useState(false)

  const filterSignature = JSON.stringify(filters.params)
  useEffect(() => {
    setPage(1)
  }, [filterSignature])

  const { data, results, total, isFetching } = usePagedList<IngestionItem>({
    keyFor: (p) => qk.ingestion.list({ ...filters.params, page: p }),
    fetchPage: (p) =>
      ingestionApi
        .list(filtersToQuery(filters.params, { page: p }))
        .then((r) => r.data as Paginated<IngestionItem>),
    page,
    pageSize: PAGE_SIZE,
  })
  const isRefreshing = isFetching && !!data

  const prefetchItem = usePrefetchDetail<IngestionItem>(
    (it) => qk.ingestion.detail(it.id),
    (it) => ingestionApi.get(it.id).then((r) => r.data)
  )

  const columns: Column<IngestionItem>[] = [
    {
      key: 'original_filename',
      header: 'Document',
      render: (it) => (
        <div className="flex items-center gap-2 min-w-0">
          <FileIcon className="w-4 h-4 text-gray-400 shrink-0" />
          <span className="block max-w-xs truncate font-medium text-gray-900 dark:text-slate-200">
            {it.original_filename || `Document #${it.id}`}
          </span>
          <DocTypeBadge docType={it.doc_type} />
        </div>
      ),
    },
    { key: 'doc_type', header: 'Type', render: (it) => <DocTypeBadge docType={it.doc_type} /> },
    { key: 'status', header: 'Status', render: (it) => <IngestionStatusBadge status={it.status} /> },
    {
      key: 'confidence',
      header: 'Confidence',
      align: 'right',
      render: (it) => <span className="tabular-nums">{confidencePct(it.confidence)}</span>,
    },
    {
      key: 'created_at',
      header: 'Uploaded',
      render: (it) => <span className="text-gray-500 dark:text-slate-400">{formatDate(it.created_at)}</span>,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Document Inbox"
        description="Upload bills, receipts and expenses — AI proposes the posting, you review and approve"
        icon={Tray}
        actions={
          <Button onClick={() => setUploadOpen(true)}>
            <UploadSimple className="w-4 h-4 mr-2" /> Upload document
          </Button>
        }
      />

      <FilterBar config={FILTER_CONFIG} filters={filters} />

      <div className="relative">
        <RefreshingOverlay active={isRefreshing} />
        <div className={refreshingContentClass(isRefreshing)}>
          <DataTable<IngestionItem>
            rowKey={(it) => it.id}
            columns={columns}
            data={results}
            loading={!data}
            onRowClick={(it) => navigate(`/app/ingestion/${it.id}`)}
            onRowHover={prefetchItem}
            emptyTitle="No documents yet"
            emptyDescription="Upload a vendor bill, fee receipt or expense. The engine reads it, drafts the document and journal, and you approve to post it to the ledger."
            emptyAction={{ label: 'Upload document', onClick: () => setUploadOpen(true) }}
            pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
          />
        </div>
      </div>

      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Upload modal
// ---------------------------------------------------------------------------

const ACCEPT = 'image/*,application/pdf'

function UploadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [docType, setDocType] = useState('vendor_bill')
  const [currency, setCurrency] = useState('USD')

  // Reset the form each time the modal opens.
  useEffect(() => {
    if (open) {
      setFile(null)
      setDocType('vendor_bill')
      setCurrency('USD')
    }
  }, [open])

  const uploadMutation = useMutation({
    mutationFn: (form: FormData) => ingestionApi.upload(form).then((r) => r.data as IngestionItem),
    onSuccess: (item) => {
      showToast.success('Document uploaded — review the proposal')
      queryClient.invalidateQueries({ queryKey: qk.ingestion.all })
      onClose()
      navigate(`/app/ingestion/${item.id}`)
    },
    onError: (error) => showToast.error(parseApiError(error, 'Upload failed')),
  })

  const submit = () => {
    if (!file) {
      showToast.error('Choose a file to upload')
      return
    }
    const form = new FormData()
    form.append('file', file)
    form.append('doc_type', docType)
    // The backend reads the multipart field `currency` as the target currency.
    form.append('currency', currency)
    uploadMutation.mutate(form)
  }

  return (
    <Modal isOpen={open} onClose={onClose} title="Upload document" icon={FileArrowUp} size="lg">
      <div className="space-y-5">
        {/* File drop / picker */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
            File <span className="text-red-500">*</span>
          </label>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2 min-w-0">
                <FileIcon className="w-5 h-5 text-primary-500 shrink-0" />
                <span className="truncate text-sm text-gray-800 dark:text-slate-200">{file.name}</span>
              </div>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-200"
                aria-label="Remove file"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className={cn(
                'w-full flex flex-col items-center justify-center gap-2 px-4 py-8 rounded-xl border-2 border-dashed transition-colors',
                'border-gray-300 hover:border-primary-400 text-gray-500 hover:text-primary-600',
                'dark:border-slate-600 dark:hover:border-primary-500 dark:text-slate-400'
              )}
            >
              <UploadSimple className="w-7 h-7" />
              <span className="text-sm font-medium">Click to choose a file</span>
              <span className="text-xs text-gray-400 dark:text-slate-500">Image or PDF</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Document type"
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            options={DOC_TYPE_OPTIONS}
          />
          <Select
            label="Currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            options={CURRENCY_OPTIONS}
          />
        </div>

        <p className="text-xs text-gray-500 dark:text-slate-400">
          The document is read automatically after upload. If AI extraction is unavailable, it lands in
          &ldquo;Needs review&rdquo; with blank fields for you to fill in by hand.
        </p>
      </div>

      <ModalFooter>
        <Button variant="secondary" onClick={onClose} disabled={uploadMutation.isPending}>
          Cancel
        </Button>
        <Button onClick={submit} loading={uploadMutation.isPending} disabled={!file}>
          <UploadSimple className="w-4 h-4 mr-2" /> Upload & extract
        </Button>
      </ModalFooter>
    </Modal>
  )
}
