import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, BookBookmark, PencilSimple } from '@phosphor-icons/react'
import { subjectsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { usePagedList } from '@/hooks/usePaginatedQuery'
import { useUrlFilters, filtersToQuery, type FilterConfig } from '@/hooks/useUrlFilters'
import { useOptimisticCreate, useOptimisticUpdate } from '@/hooks/useOptimisticMutation'
import {
  Badge,
  Button,
  DataTable,
  FilterBar,
  IconButton,
  Input,
  Modal,
  ModalFooter,
  PageHeader,
  RefreshingOverlay,
  Select,
  refreshingContentClass,
  type Column,
} from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import type { Subject } from '@/types/students'

const PAGE_SIZE = 25

const FILTER_CONFIG: FilterConfig = [
  { type: 'search', placeholder: 'Search code or name…' },
  { type: 'boolean', field: 'is_active', label: 'Active' },
]

export default function Subjects() {
  const filters = useUrlFilters(FILTER_CONFIG)
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Subject | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const filterSignature = JSON.stringify(filters.params)
  useEffect(() => {
    setPage(1)
  }, [filterSignature])

  const { data, results, total, isFetching } = usePagedList<Subject>({
    keyFor: (p) => qk.subjects.list({ ...filters.params, page: p }),
    fetchPage: (p) =>
      subjectsApi.list(filtersToQuery(filters.params, { page: p })).then((r) => r.data as Paginated<Subject>),
    page,
    pageSize: PAGE_SIZE,
  })
  const isRefreshing = isFetching && !!data

  const columns: Column<Subject>[] = [
    { key: 'code', header: 'Code', render: (s) => <span className="font-mono text-primary-600 dark:text-primary-400">{s.code}</span> },
    { key: 'name', header: 'Name', render: (s) => <span className="font-medium">{s.name}</span> },
    {
      key: 'is_active',
      header: 'Status',
      render: (s) => (s.is_active ? <Badge variant="success" dot>Active</Badge> : <Badge variant="default" dot>Inactive</Badge>),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (s) => (
        <IconButton
          icon={PencilSimple}
          aria-label="Edit subject"
          onClick={(e) => {
            e.stopPropagation()
            setEditing(s)
          }}
        />
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subjects"
        description="Subjects taught across the school"
        icon={BookBookmark}
        actions={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-2" /> New Subject
          </Button>
        }
      />

      <FilterBar config={FILTER_CONFIG} filters={filters} />

      <div className="relative">
        <RefreshingOverlay active={isRefreshing} />
        <div className={refreshingContentClass(isRefreshing)}>
          <DataTable<Subject>
            rowKey={(s) => s.id}
            columns={columns}
            data={results}
            loading={!data}
            onRowClick={(s) => setEditing(s)}
            emptyTitle="No subjects found"
            emptyDescription="No subjects match the current filters."
            pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
          />
        </div>
      </div>

      <SubjectFormModal key={showCreate ? 'new-open' : 'new'} open={showCreate} onClose={() => setShowCreate(false)} />
      <SubjectFormModal key={editing?.id ?? 'edit'} open={!!editing} subject={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

const schema = z.object({
  code: z.string().default(''),
  name: z.string().min(1, 'Name is required'),
  is_active: z.boolean().default(true),
})

type FormValues = z.infer<typeof schema>

function SubjectFormModal({
  open,
  subject,
  onClose,
}: {
  open: boolean
  subject?: Subject | null
  onClose: () => void
}) {
  const isEdit = !!subject
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: {
      code: subject?.code ?? '',
      name: subject?.name ?? '',
      is_active: subject?.is_active ?? true,
    },
  })

  const createMutation = useOptimisticCreate<Subject, FormValues>({
    mutationFn: (values) =>
      subjectsApi.create({
        ...(values.code ? { code: values.code } : {}),
        name: values.name,
        is_active: values.is_active,
      }),
    queryKeyPrefixes: [qk.subjects.all],
    createPlaceholder: (values) => ({
      id: -Date.now(),
      code: values.code || '…',
      name: values.name,
      is_active: values.is_active,
    }),
    successMessage: 'Subject created',
    errorMessage: 'Failed to create subject',
    closeModal: () => {
      reset()
      onClose()
    },
  })

  const updateMutation = useOptimisticUpdate<Subject, FormValues & { id: number }>({
    mutationFn: (values) =>
      subjectsApi.update(values.id, { code: values.code, name: values.name, is_active: values.is_active }),
    queryKeyPrefixes: [qk.subjects.all],
    successMessage: 'Subject updated',
    errorMessage: 'Failed to update subject',
    closeModal: () => {
      reset()
      onClose()
    },
  })

  const onSubmit = (values: FormValues) => {
    if (isEdit && subject) updateMutation.mutate({ ...values, id: subject.id })
    else createMutation.mutate(values)
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Subject' : 'New Subject'}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Code"
          placeholder="Leave blank to auto-generate"
          error={errors.code?.message}
          {...register('code')}
        />
        <Input label="Name" placeholder="e.g. Mathematics" error={errors.name?.message} {...register('name')} />
        <Select label="Status" {...register('is_active', { setValueAs: (v) => v === 'true' || v === true })} defaultValue={String(subject?.is_active ?? true)}>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </Select>
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={isSubmitting || createMutation.isPending || updateMutation.isPending}>
            {isEdit ? 'Save Changes' : 'Create Subject'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
