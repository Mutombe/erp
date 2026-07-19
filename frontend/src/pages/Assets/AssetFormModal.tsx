import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Landmark } from 'lucide-react'
import { assetsApi, assetCategoriesApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { showToast, parseApiError } from '@/lib/toast'
import { Button, FormRow, Input, Modal, ModalFooter, Select } from '@/components/ui'
import type { AssetCategory } from '@/types/assets'

const schema = z.object({
  code: z.string().default(''),
  name: z.string().min(2, 'Name is required'),
  category: z.string().min(1, 'Category is required'),
  acquisition_date: z.string().min(1, 'Acquisition date is required'),
  in_service_date: z.string().min(1, 'In-service date is required'),
  cost: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Enter a valid amount'),
  currency: z.string().default('USD'),
  residual_value: z.string().default(''),
  serial_number: z.string().default(''),
  location: z.string().default(''),
  custodian: z.string().default(''),
})

type FormValues = z.infer<typeof schema>

export default function AssetFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { currency: 'USD' },
  })

  const { data: categories } = useQuery({
    queryKey: qk.assetCategories.list(),
    queryFn: () => assetCategoriesApi.list().then((r) => r.data as AssetCategory[]),
    enabled: open,
  })

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload: Record<string, unknown> = {
        name: values.name,
        category: Number(values.category),
        acquisition_date: values.acquisition_date,
        in_service_date: values.in_service_date,
        cost: values.cost,
        currency: values.currency || 'USD',
        residual_value: values.residual_value || '0',
        serial_number: values.serial_number,
        location: values.location,
        custodian: values.custodian,
      }
      if (values.code) payload.code = values.code
      return assetsApi.create(payload)
    },
    onSuccess: () => {
      showToast.success('Asset created and capitalized')
      queryClient.invalidateQueries({ queryKey: qk.assets.all })
      queryClient.invalidateQueries({ queryKey: qk.accounts.all })
      queryClient.invalidateQueries({ queryKey: qk.journals.all })
      queryClient.invalidateQueries({ queryKey: qk.reports.all })
      reset()
      onClose()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to create asset')),
  })

  return (
    <Modal open={open} onClose={onClose} title="New Asset" icon={Landmark} size="2xl">
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
        <FormRow>
          <Input
            label="Code"
            placeholder="Leave blank to auto-number (AST…)"
            error={errors.code?.message}
            {...register('code')}
          />
          <Input label="Name" required error={errors.name?.message} {...register('name')} />
        </FormRow>
        <FormRow>
          <Select
            label="Category"
            required
            placeholder="Select a category…"
            error={errors.category?.message}
            options={(categories ?? []).map((c) => ({ value: String(c.id), label: `${c.code} · ${c.name}` }))}
            {...register('category')}
          />
          <Select label="Currency" {...register('currency')} defaultValue="USD">
            <option value="USD">USD</option>
            <option value="ZWG">ZWG</option>
          </Select>
        </FormRow>
        <FormRow>
          <Input
            label="Acquisition date"
            type="date"
            required
            error={errors.acquisition_date?.message}
            {...register('acquisition_date')}
          />
          <Input
            label="In-service date"
            type="date"
            required
            error={errors.in_service_date?.message}
            {...register('in_service_date')}
          />
        </FormRow>
        <FormRow>
          <Input
            label="Cost"
            required
            placeholder="0.00"
            error={errors.cost?.message}
            {...register('cost')}
          />
          <Input
            label="Residual value (base currency)"
            placeholder="0.00"
            error={errors.residual_value?.message}
            {...register('residual_value')}
          />
        </FormRow>
        <FormRow>
          <Input label="Serial number" {...register('serial_number')} />
          <Input label="Location" {...register('location')} />
        </FormRow>
        <Input label="Custodian" {...register('custodian')} />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Depreciation method, useful life and posting accounts come from the category. The cost is
          translated to base currency at the acquisition-date rate.
        </p>
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={isSubmitting || mutation.isPending}>Create Asset</Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
