import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TreeStructure } from '@phosphor-icons/react'
import { assetCategoriesApi, accountsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { showToast, parseApiError } from '@/lib/toast'
import { Button, FormRow, Input, Modal, ModalFooter, Select } from '@/components/ui'
import type { Account } from '@/types/accounting'

const schema = z.object({
  code: z.string().min(1, 'Code is required'),
  name: z.string().min(2, 'Name is required'),
  depreciation_method: z.string().min(1, 'Method is required'),
  useful_life_months: z.string().regex(/^\d+$/, 'Whole number of months'),
  residual_rate: z.string().default('0'),
  annual_rate: z.string().default('0'),
  asset_account: z.string().min(1, 'Asset account is required'),
  accum_depr_account: z.string().min(1, 'Accumulated depreciation account is required'),
  depr_expense_account: z.string().min(1, 'Depreciation expense account is required'),
})

type FormValues = z.infer<typeof schema>

/** Options for accounts whose 4-digit code falls in [lo, hi]. */
function accountOptions(accounts: Account[] | undefined, lo: number, hi: number) {
  return (accounts ?? [])
    .filter((a) => {
      const code = parseInt(a.code, 10)
      return !Number.isNaN(code) && code >= lo && code <= hi
    })
    .map((a) => ({ value: String(a.id), label: `${a.code} · ${a.name}` }))
}

export default function CategoryFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { depreciation_method: 'straight_line', useful_life_months: '60', residual_rate: '0', annual_rate: '0' },
  })

  const method = watch('depreciation_method')

  const { data: accounts } = useQuery({
    queryKey: qk.accounts.list(),
    queryFn: () => accountsApi.list().then((r) => r.data as Account[]),
    enabled: open,
  })

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      assetCategoriesApi.create({
        code: values.code,
        name: values.name,
        depreciation_method: values.depreciation_method,
        useful_life_months: Number(values.useful_life_months),
        residual_rate: values.residual_rate || '0',
        annual_rate: values.annual_rate || '0',
        asset_account: Number(values.asset_account),
        accum_depr_account: Number(values.accum_depr_account),
        depr_expense_account: Number(values.depr_expense_account),
      }),
    onSuccess: () => {
      showToast.success('Asset category created')
      queryClient.invalidateQueries({ queryKey: qk.assetCategories.all })
      reset()
      onClose()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to create category')),
  })

  return (
    <Modal open={open} onClose={onClose} title="New Asset Category" icon={TreeStructure} size="2xl">
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
        <FormRow>
          <Input label="Code" required placeholder="e.g. VEH" error={errors.code?.message} {...register('code')} />
          <Input label="Name" required placeholder="e.g. Motor Vehicles" error={errors.name?.message} {...register('name')} />
        </FormRow>
        <FormRow>
          <Select label="Depreciation method" required error={errors.depreciation_method?.message} {...register('depreciation_method')} defaultValue="straight_line">
            <option value="straight_line">Straight line</option>
            <option value="reducing_balance">Reducing balance</option>
          </Select>
          <Input
            label="Useful life (months)"
            required
            error={errors.useful_life_months?.message}
            {...register('useful_life_months')}
          />
        </FormRow>
        <FormRow>
          <Input
            label="Residual rate (% of cost)"
            error={errors.residual_rate?.message}
            {...register('residual_rate')}
          />
          <Input
            label="Annual rate (%)"
            hint={method === 'reducing_balance' ? 'Required for reducing balance' : 'Only used by reducing balance'}
            error={errors.annual_rate?.message}
            {...register('annual_rate')}
          />
        </FormRow>
        <Select
          label="Asset (cost) account"
          required
          placeholder="1500–1599…"
          searchable
          error={errors.asset_account?.message}
          options={accountOptions(accounts, 1500, 1599)}
          {...register('asset_account')}
        />
        <Select
          label="Accumulated depreciation account"
          required
          placeholder="1600–1699…"
          searchable
          error={errors.accum_depr_account?.message}
          options={accountOptions(accounts, 1600, 1699)}
          {...register('accum_depr_account')}
        />
        <Select
          label="Depreciation expense account"
          required
          placeholder="5800–5899…"
          searchable
          error={errors.depr_expense_account?.message}
          options={accountOptions(accounts, 5800, 5899)}
          {...register('depr_expense_account')}
        />
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={isSubmitting || mutation.isPending}>Create Category</Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
