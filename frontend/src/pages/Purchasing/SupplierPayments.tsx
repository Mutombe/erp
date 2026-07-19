import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Wallet } from '@phosphor-icons/react'
import { bankAccountsApi, suppliersApi, supplierPaymentsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { useDebounce } from '@/lib/utils'
import { showToast, parseApiError } from '@/lib/toast'
import {
  Button,
  DataTable,
  FormRow,
  Input,
  Modal,
  ModalFooter,
  PageHeader,
  Select,
  StatusBadge,
  type Column,
} from '@/components/ui'
import type { BankAccount, Paginated } from '@/types/accounting'
import { money, type Supplier, type SupplierPayment } from '@/types/procurement'

const schema = z.object({
  supplier: z.coerce.number().min(1, 'Supplier is required'),
  bank_account: z.coerce.number().min(1, 'Bank account is required'),
  amount: z.coerce.number().positive('Amount must be positive'),
  date: z.string().min(1, 'Date is required'),
  reference: z.string().default(''),
})

type FormValues = z.infer<typeof schema>

function PaymentFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: suppliers } = useQuery({
    queryKey: qk.suppliers.list({ for: 'select' }),
    queryFn: () =>
      suppliersApi
        .list({ is_active: true, page_size: 500 })
        .then((r) => (r.data as Paginated<Supplier>).results),
  })

  const { data: bankAccounts } = useQuery({
    queryKey: qk.bankAccounts.list({ is_active: true }),
    queryFn: () => bankAccountsApi.list({ is_active: true }).then((r) => r.data as BankAccount[]),
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      supplier: 0,
      bank_account: 0,
      amount: 0,
      date: new Date().toISOString().slice(0, 10),
      reference: '',
    },
  })

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      supplierPaymentsApi.create({
        supplier: values.supplier,
        bank_account: values.bank_account,
        amount: values.amount.toFixed(2),
        date: values.date,
        reference: values.reference,
      }),
    onSuccess: (r) => {
      showToast.success(`Payment ${r.data.number} posted`)
      // Payment posts a journal and auto-allocates FIFO across open bills.
      queryClient.invalidateQueries({ queryKey: qk.supplierPayments.all })
      queryClient.invalidateQueries({ queryKey: qk.vendorBills.all })
      queryClient.invalidateQueries({ queryKey: qk.journals.all })
      queryClient.invalidateQueries({ queryKey: qk.accounts.all })
      queryClient.invalidateQueries({ queryKey: qk.bankAccounts.all })
      queryClient.invalidateQueries({ queryKey: qk.reports.all })
      reset()
      onClose()
      navigate(`/app/supplier-payments/${r.data.id}`)
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to record payment')),
  })

  return (
    <Modal open={open} onClose={onClose} title="New Supplier Payment" icon={Wallet}>
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
        <Select label="Supplier" error={errors.supplier?.message} {...register('supplier')}>
          <option value={0}>Select supplier…</option>
          {(suppliers ?? []).map((s) => (
            <option key={s.id} value={s.id}>{s.code} · {s.name}</option>
          ))}
        </Select>
        <Select label="Paid from" error={errors.bank_account?.message} {...register('bank_account')}>
          <option value={0}>Select bank account…</option>
          {(bankAccounts ?? []).map((b) => (
            <option key={b.id} value={b.id}>{b.name} ({b.currency})</option>
          ))}
        </Select>
        <FormRow>
          <Input type="number" step="0.01" min="0" label="Amount" error={errors.amount?.message} {...register('amount')} />
          <Input type="date" label="Date" error={errors.date?.message} {...register('date')} />
        </FormRow>
        <Input label="Reference" placeholder="e.g. transfer / cheque number" {...register('reference')} />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          The payment posts immediately and is allocated to this supplier's oldest open bills first.
        </p>
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={isSubmitting || mutation.isPending}>Record Payment</Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}

export default function SupplierPayments() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const debouncedSearch = useDebounce(search, 300)

  const { data, isLoading } = useQuery({
    queryKey: qk.supplierPayments.list({ page, search: debouncedSearch }),
    queryFn: () =>
      supplierPaymentsApi
        .list({ page, search: debouncedSearch || undefined })
        .then((r) => r.data as Paginated<SupplierPayment>),
    placeholderData: keepPreviousData,
  })

  const columns: Column<SupplierPayment>[] = [
    { key: 'number', header: 'Number', render: (p) => <span className="font-mono text-primary-600 dark:text-primary-400">{p.number}</span> },
    { key: 'date', header: 'Date' },
    {
      key: 'supplier',
      header: 'Supplier',
      render: (p) => (
        <Link
          to={`/app/suppliers/${p.supplier}`}
          onClick={(e) => e.stopPropagation()}
          className="text-primary-600 dark:text-primary-400 hover:underline"
        >
          {p.supplier_name}
        </Link>
      ),
    },
    { key: 'reference', header: 'Reference', render: (p) => p.reference || '—' },
    { key: 'currency', header: 'Ccy' },
    { key: 'amount', header: 'Amount', align: 'right', render: (p) => <span className="tabular-nums">{money(p.amount)}</span> },
    {
      key: 'journal',
      header: 'Journal',
      render: (p) =>
        p.journal ? (
          <Link
            to={`/app/journals/${p.journal}`}
            onClick={(e) => e.stopPropagation()}
            className="text-primary-600 dark:text-primary-400 hover:underline font-mono"
          >
            {p.journal_number}
          </Link>
        ) : (
          '—'
        ),
    },
    { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supplier Payments"
        description="Payments to vendors, auto-allocated to their oldest open bills"
        icon={Wallet}
        actions={
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> New Payment
          </Button>
        }
      />

      <DataTable<SupplierPayment>
        rowKey={(p) => p.id}
        columns={columns}
        data={data?.results ?? []}
        loading={isLoading}
        searchable
        searchValue={search}
        onSearch={(q) => { setSearch(q); setPage(1) }}
        searchPlaceholder="Search number, reference, supplier…"
        onRowClick={(p) => navigate(`/app/supplier-payments/${p.id}`)}
        emptyTitle="No supplier payments"
        pagination={{
          page,
          pageSize: 25,
          total: data?.count ?? 0,
          onPageChange: setPage,
        }}
      />

      <PaymentFormModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  )
}
