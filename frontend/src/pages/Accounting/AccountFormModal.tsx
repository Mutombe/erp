import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { accountsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { showToast, parseApiError } from '@/lib/toast'
import { Button, FormRow, Input, Modal, ModalFooter, Select } from '@/components/ui'

const schema = z.object({
  code: z.string().regex(/^\d{4}$/, 'Code must be 4 digits (range determines its type)'),
  name: z.string().min(2, 'Name is required'),
  report_group: z.string().min(1, 'Report group is required'),
  currency: z.string().default(''),
  description: z.string().default(''),
})

type FormValues = z.infer<typeof schema>

const REPORT_GROUPS = [
  ['current_assets', 'Current Assets'],
  ['non_current_assets', 'Non-current Assets'],
  ['current_liabilities', 'Current Liabilities'],
  ['non_current_liabilities', 'Non-current Liabilities'],
  ['equity', 'Accumulated Fund / Equity'],
  ['fee_income', 'Fee Income'],
  ['other_income', 'Other Income'],
  ['operating_expenses', 'Operating Expenses'],
  ['administrative_expenses', 'Administrative Expenses'],
  ['finance_costs', 'Finance Costs'],
]

export default function AccountFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const mutation = useMutation({
    mutationFn: (values: FormValues) => accountsApi.create(values),
    onSuccess: () => {
      showToast.success('Account created')
      queryClient.invalidateQueries({ queryKey: qk.accounts.all })
      reset()
      onClose()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to create account')),
  })

  return (
    <Modal open={open} onClose={onClose} title="New Account">
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
        <FormRow>
          <Input
            label="Code"
            placeholder="e.g. 5150"
            error={errors.code?.message}
            {...register('code')}
          />
          <Input label="Name" error={errors.name?.message} {...register('name')} />
        </FormRow>
        <FormRow>
          <Select label="Report group" error={errors.report_group?.message} {...register('report_group')}>
            <option value="">Select…</option>
            {REPORT_GROUPS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
          <Select label="Currency (monetary accounts only)" {...register('currency')}>
            <option value="">Any / not currency-specific</option>
            <option value="USD">USD</option>
            <option value="ZWG">ZWG</option>
          </Select>
        </FormRow>
        <Input label="Description" {...register('description')} />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          The code range determines the account type automatically (1000s assets, 2000s liabilities,
          3000s equity, 4000s income, 5000s expenses).
        </p>
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={isSubmitting || mutation.isPending}>Create Account</Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
