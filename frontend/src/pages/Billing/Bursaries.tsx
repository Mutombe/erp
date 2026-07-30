import { useEffect, useState } from 'react'
import { HandHeart } from '@phosphor-icons/react'
import { bursariesApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { usePagedList } from '@/hooks/usePaginatedQuery'
import { useUrlFilters, filtersToQuery, type FilterConfig } from '@/hooks/useUrlFilters'
import RecordLink from '@/components/RecordLink'
import {
  Badge,
  DataTable,
  FilterBar,
  PageHeader,
  RefreshingOverlay,
  refreshingContentClass,
  type Column,
} from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import { fmtMoney, type BursaryAward } from '@/types/fees'

const PAGE_SIZE = 25

const FILTER_CONFIG: FilterConfig = [
  { type: 'search', placeholder: 'Search student, funder…' },
  {
    type: 'chips',
    field: 'award_type',
    label: 'Type',
    multi: true,
    options: [
      { value: 'percent', label: 'Percentage' },
      { value: 'fixed', label: 'Fixed amount' },
    ],
  },
  { type: 'boolean', field: 'is_active', label: 'Active' },
]

function awardLabel(b: BursaryAward): string {
  return b.award_type === 'percent' ? `${parseFloat(b.value)}%` : fmtMoney(b.value)
}

export default function Bursaries() {
  const filters = useUrlFilters(FILTER_CONFIG)
  const [page, setPage] = useState(1)

  const filterSignature = JSON.stringify(filters.params)
  useEffect(() => {
    setPage(1)
  }, [filterSignature])

  const { data, results, total, isFetching } = usePagedList<BursaryAward>({
    keyFor: (p) => qk.bursaries.list({ ...filters.params, page: p }),
    fetchPage: (p) =>
      bursariesApi.list(filtersToQuery(filters.params, { page: p })).then((r) => r.data as Paginated<BursaryAward>),
    page,
    pageSize: PAGE_SIZE,
  })
  const isRefreshing = isFetching && !!data

  const columns: Column<BursaryAward>[] = [
    {
      key: 'student',
      header: 'Student',
      render: (b) => (
        <RecordLink to={`/app/students/${b.student}`}>
          <span className="font-mono">{b.student_code}</span> {b.student_name}
        </RecordLink>
      ),
    },
    {
      key: 'fee_category',
      header: 'Category',
      render: (b) =>
        b.fee_category_code ? <span className="font-mono">{b.fee_category_code}</span> : <span className="text-gray-400">All fees</span>,
    },
    {
      key: 'award_type',
      header: 'Type',
      render: (b) => (
        <Badge variant={b.award_type === 'percent' ? 'info' : 'purple'} size="sm">
          {b.award_type === 'percent' ? 'Percentage' : 'Fixed'}
        </Badge>
      ),
    },
    { key: 'value', header: 'Award', align: 'right', render: (b) => <span className="tabular-nums">{awardLabel(b)}</span> },
    { key: 'funder', header: 'Funder', render: (b) => b.funder || <span className="text-gray-400">—</span> },
    {
      key: 'is_active',
      header: 'Status',
      render: (b) => (
        <Badge variant={b.is_active ? 'success' : 'default'} dot>
          {b.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bursaries"
        description="Scholarships and fee discounts awarded to students — applied automatically at billing"
        icon={HandHeart}
      />

      <FilterBar config={FILTER_CONFIG} filters={filters} />

      <div className="relative">
        <RefreshingOverlay active={isRefreshing} />
        <div className={refreshingContentClass(isRefreshing)}>
          <DataTable<BursaryAward>
            rowKey={(b) => b.id}
            columns={columns}
            data={results}
            loading={!data}
            emptyTitle="No bursaries"
            emptyDescription="Bursary awards reduce a student's billed fees automatically during billing runs."
            pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
          />
        </div>
      </div>
    </div>
  )
}
