import { useEffect, useState } from 'react'
import { Plus, Warehouse as WarehouseIcon } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { warehousesApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { usePagedList } from '@/hooks/usePaginatedQuery'
import { useOptimisticCreate } from '@/hooks/useOptimisticMutation'
import { usePrefetchDetail } from '@/hooks/usePrefetch'
import { useUrlFilters, filtersToQuery, type FilterConfig } from '@/hooks/useUrlFilters'
import {
  Badge,
  Button,
  DataTable,
  FilterBar,
  FormRow,
  Input,
  Modal,
  ModalFooter,
  PageHeader,
  RefreshingOverlay,
  refreshingContentClass,
  type Column,
} from '@/components/ui'
import type { Warehouse } from '@/types/inventory'
import type { Paginated } from '@/types/accounting'

const PAGE_SIZE = 25

const FILTER_CONFIG: FilterConfig = [
  { type: 'search', placeholder: 'Search code, name, location…' },
]

const schema = z.object({
  code: z.string().min(1, 'Code is required'),
  name: z.string().min(2, 'Name is required'),
  location: z.string().default(''),
})

type FormValues = z.infer<typeof schema>

function WarehouseFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const mutation = useOptimisticCreate<Warehouse, FormValues>({
    mutationFn: (values) => warehousesApi.create(values),
    queryKeyPrefixes: [qk.warehouses.all],
    createPlaceholder: (values) => ({
      id: -Date.now(),
      code: values.code,
      name: values.name,
      location: values.location,
      storekeeper: null,
      is_active: true,
    }),
    successMessage: 'Warehouse created',
    errorMessage: 'Failed to create warehouse',
    closeModal: () => {
      reset()
      onClose()
    },
  })

  return (
    <Modal open={open} onClose={onClose} title="New Warehouse">
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
        <FormRow>
          <Input label="Code" placeholder="e.g. MAIN" error={errors.code?.message} {...register('code')} />
          <Input label="Name" error={errors.name?.message} {...register('name')} />
        </FormRow>
        <Input label="Location" placeholder="e.g. Admin block, room 4" error={errors.location?.message} {...register('location')} />
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={isSubmitting || mutation.isPending}>Create Warehouse</Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}

export default function Warehouses() {
  const navigate = useNavigate()
  const filters = useUrlFilters(FILTER_CONFIG)
  const [modalOpen, setModalOpen] = useState(false)
  const [page, setPage] = useState(1)

  const filterSignature = JSON.stringify(filters.params)
  useEffect(() => {
    setPage(1)
  }, [filterSignature])

  const { data, results, total, isFetching } = usePagedList<Warehouse>({
    keyFor: (p) => qk.warehouses.list({ ...filters.params, page: p }),
    fetchPage: (p) =>
      warehousesApi.list(filtersToQuery(filters.params, { page: p })).then((r) => r.data as Paginated<Warehouse>),
    page,
    pageSize: PAGE_SIZE,
  })
  const warehouses = results
  const isRefreshing = isFetching && !!data

  // Warm the warehouse detail cache on row hover so opening a warehouse is instant.
  const prefetchWarehouse = usePrefetchDetail<Warehouse>(
    (w) => qk.warehouses.detail(w.id),
    (w) => warehousesApi.get(w.id).then((r) => r.data)
  )

  const columns: Column<Warehouse>[] = [
    { key: 'code', header: 'Code', render: (w) => <span className="font-mono text-primary-600 dark:text-primary-400">{w.code}</span> },
    { key: 'name', header: 'Name' },
    { key: 'location', header: 'Location', render: (w) => w.location || '—' },
    {
      key: 'is_active',
      header: 'Status',
      render: (w) => <Badge variant={w.is_active ? 'success' : 'default'} dot>{w.is_active ? 'Active' : 'Inactive'}</Badge>,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Warehouses"
        description="Physical stock locations — stores, labs and departments"
        icon={WarehouseIcon}
        actions={
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> New Warehouse
          </Button>
        }
      />

      <FilterBar config={FILTER_CONFIG} filters={filters} />

      <div className="relative">
        <RefreshingOverlay active={isRefreshing} />
        <div className={refreshingContentClass(isRefreshing)}>
          <DataTable<Warehouse>
            rowKey={(w) => w.id}
            columns={columns}
            data={warehouses}
            loading={!data}
            onRowClick={(w) => navigate(`/app/warehouses/${w.id}`)}
            onRowHover={prefetchWarehouse}
            emptyTitle="No warehouses"
            emptyDescription="Create a warehouse to start receiving stock."
            pagination={{
              page,
              pageSize: PAGE_SIZE,
              total,
              onPageChange: setPage,
            }}
          />
        </div>
      </div>

      <WarehouseFormModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  )
}
