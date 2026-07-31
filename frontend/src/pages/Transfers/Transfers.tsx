import { useEffect, useState } from 'react'
import { ArrowsLeftRight, ArrowRight, Plus } from '@phosphor-icons/react'
import { transfersApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { usePagedList } from '@/hooks/usePaginatedQuery'
import { useUrlFilters, filtersToQuery, type FilterConfig } from '@/hooks/useUrlFilters'
import { useAuthStore } from '@/stores/authStore'
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  FilterBar,
  PageHeader,
  RefreshingOverlay,
  StatusBadge,
  refreshingContentClass,
  type Column,
} from '@/components/ui'
import RecordLink from '@/components/RecordLink'
import type { Paginated } from '@/types/accounting'
import { fmtMoney } from '@/types/fees'
import {
  TRANSFER_KIND_OPTIONS,
  TRANSFER_STATUS_OPTIONS,
  type Transfer,
} from '@/types/transfers'
import TransferFormModal from './TransferFormModal'

const PAGE_SIZE = 25

const FILTER_CONFIG: FilterConfig = [
  { type: 'search', placeholder: 'Search number, note or pupil code…' },
  { type: 'chips', field: 'kind', label: 'Kind', options: [...TRANSFER_KIND_OPTIONS] },
  { type: 'chips', field: 'status', label: 'Status', options: [...TRANSFER_STATUS_OPTIONS] },
]

export default function Transfers() {
  const isHq = useAuthStore((s) => s.isHq)
  const filters = useUrlFilters(FILTER_CONFIG)
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)

  const filterSignature = JSON.stringify(filters.params)
  useEffect(() => {
    setPage(1)
  }, [filterSignature])

  const { data, results, total, isFetching } = usePagedList<Transfer>({
    keyFor: (p) => qk.transfers.list({ ...filters.params, page: p }),
    fetchPage: (p) =>
      transfersApi.list(filtersToQuery(filters.params, { page: p })).then((r) => r.data as Paginated<Transfer>),
    page,
    pageSize: PAGE_SIZE,
    enabled: isHq,
  })
  const isRefreshing = isFetching && !!data

  // HQ-only feature: a non-HQ user who lands here sees a clear notice, never data.
  if (!isHq) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Inter-School Transfers"
          description="Move funds or pupils between Golden Knot schools"
          icon={ArrowsLeftRight}
        />
        <EmptyState
          icon={ArrowsLeftRight}
          title="HQ only"
          description="Inter-school transfers are managed by Golden Knot HQ."
        />
      </div>
    )
  }

  const columns: Column<Transfer>[] = [
    {
      key: 'number',
      header: 'Number',
      render: (t) => <span className="font-mono text-primary-600 dark:text-primary-400">{t.number}</span>,
    },
    {
      key: 'kind',
      header: 'Kind',
      render: (t) => (
        <Badge variant={t.kind === 'funds' ? 'info' : t.kind === 'stock' ? 'success' : 'purple'}>
          {t.kind === 'funds' ? 'Funds' : t.kind === 'stock' ? 'Stock' : 'Student'}
        </Badge>
      ),
    },
    {
      key: 'route',
      header: 'From → To',
      render: (t) => (
        <span className="flex items-center gap-1.5 text-sm">
          <span className="truncate">{t.from_school_name}</span>
          <ArrowRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <span className="truncate">{t.to_school_name}</span>
        </span>
      ),
    },
    {
      key: 'detail',
      header: 'Pupil / Item',
      render: (t) => {
        if (t.kind === 'student') {
          return (
            <span className="flex items-center gap-1.5 text-sm">
              {t.from_student ? (
                <RecordLink to={`/app/students/${t.from_student}`}>{t.from_student_name}</RecordLink>
              ) : (
                <span className="text-gray-400">—</span>
              )}
              {t.to_student && (
                <>
                  <ArrowRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <RecordLink to={`/app/students/${t.to_student}`} mono>
                    {t.to_student_code}
                  </RecordLink>
                </>
              )}
            </span>
          )
        }
        if (t.kind === 'stock') {
          return (
            <span className="flex items-center gap-1.5 text-sm">
              {t.from_item ? (
                <RecordLink to={`/app/items/${t.from_item}`} mono>{t.from_item_code}</RecordLink>
              ) : (
                <span className="text-gray-400">—</span>
              )}
              {t.quantity != null && (
                <span className="text-gray-500 dark:text-slate-400 tabular-nums">× {fmtMoney(t.quantity)}</span>
              )}
            </span>
          )
        }
        return <span className="text-gray-400">—</span>
      },
    },
    { key: 'date', header: 'Date', render: (t) => t.date },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (t) =>
        t.kind === 'student' || Number(t.amount) === 0 ? (
          <span className="text-gray-400">—</span>
        ) : (
          <span className="tabular-nums">
            {t.currency} {fmtMoney(t.amount)}
          </span>
        ),
    },
    {
      key: 'journals',
      header: 'Journals',
      render: (t) => (
        <span className="flex items-center gap-2 text-sm">
          {t.from_journal ? (
            <RecordLink to={`/app/journals/${t.from_journal}`} mono>
              {t.from_journal_number}
            </RecordLink>
          ) : null}
          {t.to_journal ? (
            <RecordLink to={`/app/journals/${t.to_journal}`} mono>
              {t.to_journal_number}
            </RecordLink>
          ) : null}
          {!t.from_journal && !t.to_journal && <span className="text-gray-400">—</span>}
        </span>
      ),
    },
    { key: 'status', header: 'Status', render: (t) => <StatusBadge status={t.status} /> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inter-School Transfers"
        description="Move funds or pupils between Golden Knot schools — each transfer settles in the ledger"
        icon={ArrowsLeftRight}
        actions={
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-2" /> New transfer
          </Button>
        }
      />

      <FilterBar config={FILTER_CONFIG} filters={filters} />

      <div className="relative">
        <RefreshingOverlay active={isRefreshing} />
        <div className={refreshingContentClass(isRefreshing)}>
          <DataTable<Transfer>
            rowKey={(t) => t.id}
            columns={columns}
            data={results}
            loading={!data}
            emptyTitle="No transfers yet"
            emptyDescription="No inter-school transfers match the current filters."
            pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
          />
        </div>
      </div>

      {showForm && <TransferFormModal open={showForm} onClose={() => setShowForm(false)} />}
    </div>
  )
}
