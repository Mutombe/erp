import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Warehouse as WarehouseIcon } from '@phosphor-icons/react'
import { warehousesApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { useOptimisticCreate } from '@/hooks/useOptimisticMutation'
import {
  Badge,
  Button,
  DataTable,
  FormRow,
  Input,
  Modal,
  ModalFooter,
  PageHeader,
  type Column,
} from '@/components/ui'
import type { Warehouse } from '@/types/inventory'

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
  const [modalOpen, setModalOpen] = useState(false)

  const { data: warehouses, isLoading } = useQuery({
    queryKey: qk.warehouses.list(),
    queryFn: () => warehousesApi.list().then((r) => r.data as Warehouse[]),
  })

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

      <DataTable<Warehouse>
        rowKey={(w) => w.id}
        columns={columns}
        data={warehouses ?? []}
        loading={isLoading}
        onRowClick={(w) => navigate(`/app/warehouses/${w.id}`)}
        emptyTitle="No warehouses"
        emptyDescription="Create a warehouse to start receiving stock."
      />

      <WarehouseFormModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  )
}
