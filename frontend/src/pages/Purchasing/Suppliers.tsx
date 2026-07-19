import { useEffect, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus, Truck } from 'lucide-react'
import { suppliersApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { useDebounce } from '@/lib/utils'
import { showToast, parseApiError } from '@/lib/toast'
import {
  Badge,
  Button,
  DataTable,
  FormRow,
  Input,
  Modal,
  ModalFooter,
  PageHeader,
  Select,
  Textarea,
  type Column,
} from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import type { Supplier } from '@/types/procurement'

const schema = z.object({
  code: z.string().default(''),
  name: z.string().min(2, 'Name is required'),
  contact_person: z.string().default(''),
  phone: z.string().default(''),
  email: z.string().email('Invalid email').or(z.literal('')).default(''),
  address: z.string().default(''),
  tax_number: z.string().default(''),
  default_currency: z.enum(['USD', 'ZWG']),
  payment_terms_days: z.coerce.number().min(0).default(30),
})

type FormValues = z.infer<typeof schema>

const emptyValues: FormValues = {
  code: '',
  name: '',
  contact_person: '',
  phone: '',
  email: '',
  address: '',
  tax_number: '',
  default_currency: 'USD',
  payment_terms_days: 30,
}

function SupplierFormModal({
  open,
  onClose,
  supplier,
}: {
  open: boolean
  onClose: () => void
  supplier?: Supplier | null
}) {
  const queryClient = useQueryClient()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  useEffect(() => {
    if (!open) return
    if (supplier) {
      reset({
        code: supplier.code,
        name: supplier.name,
        contact_person: supplier.contact_person,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
        tax_number: supplier.tax_number,
        default_currency: (supplier.default_currency as 'USD' | 'ZWG') || 'USD',
        payment_terms_days: supplier.payment_terms_days,
      })
    } else {
      reset(emptyValues)
    }
  }, [open, supplier, reset])

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = { ...values, code: values.code || undefined }
      return supplier ? suppliersApi.update(supplier.id, payload) : suppliersApi.create(payload)
    },
    onSuccess: () => {
      showToast.success(supplier ? 'Supplier updated' : 'Supplier created')
      queryClient.invalidateQueries({ queryKey: qk.suppliers.all })
      reset(emptyValues)
      onClose()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to save supplier')),
  })

  return (
    <Modal open={open} onClose={onClose} title={supplier ? `Edit ${supplier.code}` : 'New Supplier'} size="lg">
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
        <FormRow>
          <Input label="Code (blank = auto)" error={errors.code?.message} {...register('code')} />
          <Input label="Name" error={errors.name?.message} {...register('name')} />
        </FormRow>
        <FormRow>
          <Input label="Contact person" error={errors.contact_person?.message} {...register('contact_person')} />
          <Input label="Phone" error={errors.phone?.message} {...register('phone')} />
        </FormRow>
        <FormRow>
          <Input label="Email" error={errors.email?.message} {...register('email')} />
          <Input label="Tax number" error={errors.tax_number?.message} {...register('tax_number')} />
        </FormRow>
        <FormRow>
          <Select label="Default currency" error={errors.default_currency?.message} {...register('default_currency')}>
            <option value="USD">USD</option>
            <option value="ZWG">ZWG</option>
          </Select>
          <Input
            type="number"
            min="0"
            label="Payment terms (days)"
            error={errors.payment_terms_days?.message}
            {...register('payment_terms_days')}
          />
        </FormRow>
        <Textarea label="Address" rows={2} {...register('address')} />
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={isSubmitting || mutation.isPending}>
            {supplier ? 'Save Changes' : 'Create Supplier'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}

export default function Suppliers() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null)
  const debouncedSearch = useDebounce(search, 300)

  const { data, isLoading } = useQuery({
    queryKey: qk.suppliers.list({ page, search: debouncedSearch }),
    queryFn: () =>
      suppliersApi
        .list({ page, search: debouncedSearch || undefined })
        .then((r) => r.data as Paginated<Supplier>),
    placeholderData: keepPreviousData,
  })

  const columns: Column<Supplier>[] = [
    { key: 'code', header: 'Code', render: (s) => <span className="font-mono text-primary-600 dark:text-primary-400">{s.code}</span> },
    { key: 'name', header: 'Name' },
    { key: 'contact_person', header: 'Contact', render: (s) => s.contact_person || '—' },
    { key: 'phone', header: 'Phone', render: (s) => s.phone || '—' },
    { key: 'default_currency', header: 'Ccy' },
    {
      key: 'is_active',
      header: 'Status',
      render: (s) => <Badge variant={s.is_active ? 'success' : 'default'} dot>{s.is_active ? 'Active' : 'Inactive'}</Badge>,
    },
    {
      key: 'edit',
      header: '',
      align: 'right',
      render: (s) => (
        <button
          onClick={(e) => {
            e.stopPropagation()
            setEditSupplier(s)
            setModalOpen(true)
          }}
          className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label={`Edit ${s.code}`}
        >
          <Pencil className="w-4 h-4" />
        </button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers"
        description="Vendors you purchase goods and services from"
        icon={Truck}
        actions={
          <Button onClick={() => { setEditSupplier(null); setModalOpen(true) }}>
            <Plus className="w-4 h-4 mr-2" /> New Supplier
          </Button>
        }
      />

      <DataTable<Supplier>
        rowKey={(s) => s.id}
        columns={columns}
        data={data?.results ?? []}
        loading={isLoading}
        searchable
        searchValue={search}
        onSearch={(q) => { setSearch(q); setPage(1) }}
        searchPlaceholder="Search code, name, contact, phone…"
        onRowClick={(s) => navigate(`/app/suppliers/${s.id}`)}
        emptyTitle="No suppliers"
        emptyDescription="Add a supplier to start raising purchase orders."
        pagination={{
          page,
          pageSize: 25,
          total: data?.count ?? 0,
          onPageChange: setPage,
        }}
      />

      <SupplierFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditSupplier(null) }}
        supplier={editSupplier}
      />
    </div>
  )
}
