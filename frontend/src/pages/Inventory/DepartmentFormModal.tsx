import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { accountsApi, departmentsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { useOptimisticCreate, useOptimisticUpdate } from '@/hooks/useOptimisticMutation'
import { Button, FormRow, Input, Modal, ModalFooter, Select, Textarea } from '@/components/ui'
import type { Account } from '@/types/accounting'
import type { Department } from '@/types/inventory'

const schema = z.object({
  code: z.string().min(1, 'Code is required').max(10, 'Code must be 10 characters or fewer'),
  name: z.string().min(2, 'Name is required'),
  head_name: z.string().default(''),
  description: z.string().default(''),
  /** Empty string = fall back to the item category default. */
  expense_account: z.string().default(''),
  is_active: z.boolean().default(true),
})

type FormValues = z.infer<typeof schema>

const emptyValues: FormValues = {
  code: '',
  name: '',
  head_name: '',
  description: '',
  expense_account: '',
  is_active: true,
}

export default function DepartmentFormModal({
  open,
  onClose,
  department,
}: {
  open: boolean
  onClose: () => void
  department?: Department | null
}) {
  const { data: accounts } = useQuery({
    queryKey: qk.accounts.list({ is_active: true }),
    queryFn: () => accountsApi.list({ is_active: true }).then((r) => r.data as Account[]),
  })

  const expenseAccounts = (accounts ?? []).filter((a) => a.account_type === 'expense')

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  useEffect(() => {
    if (!open) return
    if (department) {
      reset({
        code: department.code,
        name: department.name,
        head_name: department.head_name,
        description: department.description,
        expense_account: department.expense_account ? String(department.expense_account) : '',
        is_active: department.is_active,
      })
    } else {
      reset(emptyValues)
    }
  }, [open, department, reset])

  const closeModal = () => {
    reset(emptyValues)
    onClose()
  }

  const accountId = (values: FormValues) =>
    values.expense_account ? Number(values.expense_account) : null

  const toPayload = (values: FormValues) => ({
    code: values.code,
    name: values.name,
    head_name: values.head_name,
    description: values.description,
    expense_account: accountId(values),
    is_active: values.is_active,
  })

  const createMutation = useOptimisticCreate<Department, FormValues>({
    mutationFn: (values) => departmentsApi.create(toPayload(values)),
    queryKeyPrefixes: [qk.departments.all],
    createPlaceholder: (values) => {
      const account = expenseAccounts.find((a) => a.id === accountId(values))
      return {
        id: -Date.now(),
        code: values.code,
        name: values.name,
        description: values.description,
        head_name: values.head_name,
        expense_account: account?.id ?? null,
        expense_account_code: account?.code ?? null,
        expense_account_name: account?.name ?? null,
        is_active: values.is_active,
        stock_move_count: 0,
        created_at: new Date().toISOString(),
      }
    },
    successMessage: 'Department created',
    errorMessage: 'Failed to create department',
    closeModal,
  })

  const updateMutation = useOptimisticUpdate<Department, Partial<Department> & { id: number }>({
    mutationFn: ({ id, ...values }) => departmentsApi.update(id, values),
    queryKeyPrefixes: [qk.departments.all],
    successMessage: 'Department updated',
    errorMessage: 'Failed to update department',
    closeModal,
  })

  const onSubmit = (values: FormValues) => {
    if (department) {
      const account = expenseAccounts.find((a) => a.id === accountId(values))
      updateMutation.mutate({
        id: department.id,
        ...toPayload(values),
        expense_account_code: account?.code ?? null,
        expense_account_name: account?.name ?? null,
      })
    } else {
      createMutation.mutate(values)
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={department ? `Edit ${department.code}` : 'New Department'}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormRow>
          <Input
            label="Code"
            placeholder="e.g. SCIENCE"
            maxLength={10}
            error={errors.code?.message}
            {...register('code', {
              onChange: (e) => setValue('code', e.target.value.toUpperCase()),
            })}
          />
          <Input label="Name" error={errors.name?.message} {...register('name')} />
        </FormRow>
        <Input
          label="Head of department"
          placeholder="e.g. Mrs T. Moyo"
          error={errors.head_name?.message}
          {...register('head_name')}
        />
        <Controller
          control={control}
          name="expense_account"
          render={({ field }) => (
            <Select
              label="Expense account"
              value={field.value ?? ''}
              onChange={(e) => field.onChange(e.target.value)}
              error={errors.expense_account?.message}
              hint="Leave empty to charge issues to the item category's default consumption expense."
              searchable
            >
              <option value="">— use item category default —</option>
              {expenseAccounts.map((a) => (
                <option key={a.id} value={String(a.id)}>{`${a.code} · ${a.name}`}</option>
              ))}
            </Select>
          )}
        />
        <Textarea
          label="Description"
          rows={3}
          error={errors.description?.message}
          {...register('description')}
        />
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            {...register('is_active')}
          />
          Active
        </label>
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={isSubmitting || isPending}>
            {department ? 'Save Changes' : 'Create Department'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
