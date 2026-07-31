import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, HandCoins, XCircle } from '@phosphor-icons/react'
import { bankAccountsApi, paymentIntentsApi, studentsApi } from '@/services/api'
import { usePagedList } from '@/hooks/usePaginatedQuery'
import { useUrlFilters, filtersToQuery, type FilterConfig } from '@/hooks/useUrlFilters'
import { useCan } from '@/hooks/useCan'
import {
  Badge,
  Button,
  DataTable,
  FilterBar,
  Input,
  Modal,
  ModalFooter,
  PageHeader,
  RefreshingOverlay,
  Select,
  Textarea,
  refreshingContentClass,
  type BadgeVariant,
  type Column,
} from '@/components/ui'
import RecordLink from '@/components/RecordLink'
import { showToast, parseApiError } from '@/lib/toast'
import { formatDate } from '@/lib/utils'
import { PAYMENT_METHODS, fmtMoney } from '@/types/fees'
import type { BankAccount, Paginated } from '@/types/accounting'
import type { IntentRow, PaymentIntentStatus } from '@/types/portal'

const PAGE_SIZE = 25

const PAYMENT_METHOD_OPTIONS = PAYMENT_METHODS.map(([value, label]) => ({ value, label }))

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD' },
  { value: 'ZWG', label: 'ZWG' },
]

const STATUS_OPTIONS = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'rejected', label: 'Rejected' },
]

const STATUS_VARIANT: Record<PaymentIntentStatus, BadgeVariant> = {
  submitted: 'warning',
  confirmed: 'success',
  rejected: 'danger',
}

const FILTER_CONFIG: FilterConfig = [
  { type: 'search', placeholder: 'Search reference…' },
  {
    type: 'select',
    field: 'student',
    label: 'Student',
    searchable: true,
    query: {
      queryKey: ['students', 'facet-options'],
      queryFn: () => studentsApi.list({ page_size: 500 }).then((r) => (r.data.results ?? r.data) as any[]),
      toOption: (row) => ({ value: String(row.id), label: `${row.code} · ${row.full_name}` }),
    },
  },
  { type: 'chips', field: 'payment_method', label: 'Method', multi: true, options: PAYMENT_METHOD_OPTIONS },
  { type: 'chips', field: 'currency', label: 'Currency', options: CURRENCY_OPTIONS },
  { type: 'chips', field: 'status', label: 'Status', options: STATUS_OPTIONS },
]

function ConfirmIntentModal({ intent, onClose }: { intent: IntentRow; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [bankAccount, setBankAccount] = useState('')
  const [date, setDate] = useState('')

  const { data: bankAccounts } = useQuery({
    queryKey: ['bankAccounts', 'list', { active: true }],
    queryFn: () =>
      bankAccountsApi
        .list({ is_active: true, page_size: 500 })
        .then((r) => (r.data.results ?? r.data) as BankAccount[]),
  })

  // The receipt currency follows the bank account, so only accounts matching the
  // intent's currency are eligible.
  const eligible = (bankAccounts ?? []).filter((b) => b.currency === intent.currency)

  const mutation = useMutation({
    mutationFn: () =>
      paymentIntentsApi.confirm(intent.id, {
        bank_account: Number(bankAccount),
        ...(date ? { date } : {}),
      }),
    onSuccess: (r) => {
      showToast.success(`Confirmed — receipt ${r.data?.receipt_number ?? ''} posted`.trim())
      queryClient.invalidateQueries({ queryKey: ['paymentIntents'] })
      queryClient.invalidateQueries({ queryKey: ['receipts'] })
      onClose()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Could not confirm this payment.')),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title="Confirm payment"
      description={`Posts a receipt for ${intent.student_name} (${fmtMoney(intent.amount)} ${intent.currency})`}
      icon={CheckCircle}
      size="lg"
    >
      <div className="space-y-4">
        <Select
          label="Bank account"
          required
          value={bankAccount}
          onChange={(e) => setBankAccount(e.target.value)}
          hint={`Only ${intent.currency} accounts are shown — the receipt currency follows the account.`}
        >
          <option value="">Select account…</option>
          {eligible.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({b.currency})
            </option>
          ))}
        </Select>
        {eligible.length === 0 && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            No active {intent.currency} bank account is available. Add one before confirming.
          </p>
        )}
        <Input
          type="date"
          label="Receipt date"
          hint="Optional — defaults to the payment's declared date."
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!bankAccount}
          >
            Confirm &amp; post receipt
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  )
}

function RejectIntentModal({ intent, onClose }: { intent: IntentRow; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')

  const mutation = useMutation({
    mutationFn: () => paymentIntentsApi.reject(intent.id, reason),
    onSuccess: () => {
      showToast.success('Payment rejected')
      queryClient.invalidateQueries({ queryKey: ['paymentIntents'] })
      onClose()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Could not reject this payment.')),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title="Reject payment"
      description={`Decline the declaration from ${intent.student_name}`}
      icon={XCircle}
      size="lg"
    >
      <div className="space-y-4">
        <Textarea
          label="Reason"
          required
          rows={3}
          placeholder="Explain why this payment can't be confirmed — the family will see this."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            type="button"
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!reason.trim()}
          >
            Reject payment
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  )
}

export default function PaymentIntents() {
  const filters = useUrlFilters(FILTER_CONFIG)
  const [page, setPage] = useState(1)
  const [confirming, setConfirming] = useState<IntentRow | null>(null)
  const [rejecting, setRejecting] = useState<IntentRow | null>(null)
  const canPost = useCan('fees', 'post')

  // Default the queue to the pending (submitted) intents on first visit.
  const { params, setParam } = filters
  useEffect(() => {
    if (!('status' in params)) setParam('status', 'submitted')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filterSignature = JSON.stringify(filters.params)
  useEffect(() => {
    setPage(1)
  }, [filterSignature])

  const { data, results, total, isFetching } = usePagedList<IntentRow>({
    keyFor: (p) => ['paymentIntents', 'list', { ...filters.params, page: p }],
    fetchPage: (p) =>
      paymentIntentsApi
        .list(filtersToQuery(filters.params, { page: p }))
        .then((r) => r.data as Paginated<IntentRow>),
    page,
    pageSize: PAGE_SIZE,
  })
  const isRefreshing = isFetching && !!data

  const columns: Column<IntentRow>[] = [
    {
      key: 'student',
      header: 'Student',
      render: (i) => (
        <RecordLink to={`/app/students/${i.student}`}>
          {i.student_name}
          <span className="ml-1.5 text-xs font-mono text-gray-400 dark:text-slate-500">{i.student_code}</span>
        </RecordLink>
      ),
    },
    { key: 'date', header: 'Date', render: (i) => formatDate(i.date) },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (i) => (
        <span className="tabular-nums">
          {fmtMoney(i.amount)} <span className="text-gray-400 dark:text-slate-500">{i.currency}</span>
        </span>
      ),
    },
    { key: 'payment_method', header: 'Method', render: (i) => <span className="capitalize">{i.payment_method.replace(/_/g, ' ')}</span> },
    { key: 'reference', header: 'Reference', render: (i) => i.reference || '—' },
    { key: 'submitted_by', header: 'Submitted by', render: (i) => <span className="text-sm text-gray-600 dark:text-slate-300">{i.submitted_by_email || i.guardian_name || '—'}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (i) => (
        <Badge variant={STATUS_VARIANT[i.status] ?? 'default'} dot>
          <span className="capitalize">{i.status}</span>
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (i) =>
        canPost && i.status === 'submitted' ? (
          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant="success"
              onClick={(e) => {
                e.stopPropagation()
                setConfirming(i)
              }}
            >
              Confirm
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation()
                setRejecting(i)
              }}
            >
              Reject
            </Button>
          </div>
        ) : i.status === 'confirmed' && i.receipt ? (
          <RecordLink to={`/app/receipts/${i.receipt}`} mono>
            {i.receipt_number}
          </RecordLink>
        ) : null,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payment Intents"
        description="Payment declarations from guardians — confirm to post a receipt, or reject with a reason"
        icon={HandCoins}
      />

      <FilterBar config={FILTER_CONFIG} filters={filters} />

      <div className="relative">
        <RefreshingOverlay active={isRefreshing} />
        <div className={refreshingContentClass(isRefreshing)}>
          <DataTable<IntentRow>
            rowKey={(i) => i.id}
            columns={columns}
            data={results}
            loading={!data}
            emptyTitle="No payment intents"
            emptyDescription="No declared payments match the current filters."
            pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
          />
        </div>
      </div>

      {confirming && <ConfirmIntentModal intent={confirming} onClose={() => setConfirming(null)} />}
      {rejecting && <RejectIntentModal intent={rejecting} onClose={() => setRejecting(null)} />}
    </div>
  )
}
