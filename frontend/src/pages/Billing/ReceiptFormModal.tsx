import { useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { bankAccountsApi, receiptsApi, studentsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { useDebounce } from '@/lib/utils'
import { showToast, parseApiError } from '@/lib/toast'
import { AsyncSelect, Button, FormRow, Input, Modal, ModalFooter, Select } from '@/components/ui'
import type { BankAccount, Paginated } from '@/types/accounting'
import type { Student } from '@/types/students'
import { PAYMENT_METHODS } from '@/types/fees'

const schema = z.object({
  student: z.coerce.number().min(1, 'Student is required'),
  bank_account: z.coerce.number().min(1, 'Bank account is required'),
  amount: z.coerce.number().positive('Amount must be positive'),
  date: z.string().min(1, 'Date is required'),
  payment_method: z.string().min(1, 'Payment method is required'),
  reference: z.string().default(''),
})

type FormValues = z.infer<typeof schema>

export default function ReceiptFormModal({
  open,
  onClose,
  initialStudent,
}: {
  open: boolean
  onClose: () => void
  initialStudent?: string | null
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [studentSearch, setStudentSearch] = useState('')
  const debouncedSearch = useDebounce(studentSearch, 300)

  const { data: studentPage, isLoading: studentsLoading } = useQuery({
    queryKey: qk.students.list({ picker: true, search: debouncedSearch }),
    queryFn: () =>
      studentsApi
        .list({ search: debouncedSearch || undefined, page_size: 100 })
        .then((r) => r.data as Paginated<Student>),
    enabled: open,
  })

  // Ensure a preselected student (?student=) is present in the options even
  // when it isn't in the current search page.
  const { data: preselected } = useQuery({
    queryKey: qk.students.detail(initialStudent ?? 'none'),
    queryFn: () => studentsApi.get(initialStudent!).then((r) => r.data as Student),
    enabled: open && Boolean(initialStudent),
  })

  const { data: bankAccounts } = useQuery({
    queryKey: qk.bankAccounts.list({ active: true }),
    queryFn: () => bankAccountsApi.list({ is_active: true }).then((r) => r.data as BankAccount[]),
    enabled: open,
  })

  const studentOptions = useMemo(() => {
    const options = (studentPage?.results ?? []).map((s) => ({
      value: s.id,
      label: `${s.code} — ${s.full_name}`,
      description: s.current_class ?? undefined,
    }))
    if (preselected && !options.some((o) => o.value === preselected.id)) {
      options.unshift({
        value: preselected.id,
        label: `${preselected.code} — ${preselected.full_name}`,
        description: preselected.current_class ?? undefined,
      })
    }
    return options
  }, [studentPage, preselected])

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      student: initialStudent ? Number(initialStudent) : 0,
      bank_account: 0,
      date: new Date().toISOString().slice(0, 10),
      payment_method: 'cash',
      reference: '',
    },
  })

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      receiptsApi.create({
        student: values.student,
        bank_account: values.bank_account,
        amount: values.amount.toFixed(2),
        date: values.date,
        payment_method: values.payment_method,
        reference: values.reference,
        // No explicit allocations — the backend auto-allocates FIFO.
      }),
    onSuccess: (r) => {
      showToast.success(`Receipt ${r.data.number} posted`)
      queryClient.invalidateQueries({ queryKey: qk.receipts.all })
      queryClient.invalidateQueries({ queryKey: qk.feeInvoices.all })
      queryClient.invalidateQueries({ queryKey: qk.students.all })
      queryClient.invalidateQueries({ queryKey: qk.journals.all })
      queryClient.invalidateQueries({ queryKey: qk.reports.all })
      reset()
      onClose()
      navigate(`/app/receipts/${r.data.id}`)
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to record receipt')),
  })

  return (
    <Modal open={open} onClose={onClose} title="New Receipt" description="Posts immediately and auto-allocates to the oldest unpaid invoices" size="2xl">
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
        <Controller
          control={control}
          name="student"
          render={({ field }) => (
            <AsyncSelect
              label="Student"
              placeholder="Search admission code or name…"
              value={field.value || null}
              onChange={(v) => field.onChange(Number(v) || 0)}
              options={studentOptions}
              isLoading={studentsLoading}
              searchable
              onSearch={setStudentSearch}
              error={errors.student?.message}
              required
            />
          )}
        />
        <FormRow>
          <Select label="Bank account" error={errors.bank_account?.message} {...register('bank_account')}>
            <option value="">Select account…</option>
            {(bankAccounts ?? []).map((b) => (
              <option key={b.id} value={b.id}>{b.name} ({b.currency})</option>
            ))}
          </Select>
          <Input
            type="number"
            step="0.01"
            min="0"
            label="Amount"
            error={errors.amount?.message}
            {...register('amount')}
          />
        </FormRow>
        <FormRow>
          <Input type="date" label="Date" error={errors.date?.message} {...register('date')} />
          <Select label="Payment method" error={errors.payment_method?.message} {...register('payment_method')}>
            {PAYMENT_METHODS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </FormRow>
        <Input
          label="Reference"
          placeholder="e.g. bank slip / EcoCash reference"
          error={errors.reference?.message}
          {...register('reference')}
        />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          The receipt currency follows the selected bank account. Payment is allocated to the
          student's oldest unpaid invoices first; any excess stays as an unallocated credit.
        </p>
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={isSubmitting || mutation.isPending}>Record Receipt</Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
