import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { itemCategoriesApi, itemsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { showToast, parseApiError } from '@/lib/toast'
import { Button, FormRow, Input, Modal, ModalFooter, Select } from '@/components/ui'
import type { Item, ItemCategory } from '@/types/inventory'

const schema = z.object({
  code: z.string().min(1, 'Code is required'),
  name: z.string().min(2, 'Name is required'),
  category: z.coerce.number().min(1, 'Category is required'),
  uom: z.string().min(1, 'Unit of measure is required'),
  item_type: z.enum(['stockable', 'consumable', 'service']),
  reorder_level: z.coerce.number().min(0).default(0),
  barcode: z.string().default(''),
})

type FormValues = z.infer<typeof schema>

const emptyValues: FormValues = {
  code: '',
  name: '',
  category: 0,
  uom: 'each',
  item_type: 'stockable',
  reorder_level: 0,
  barcode: '',
}

export default function ItemFormModal({
  open,
  onClose,
  item,
}: {
  open: boolean
  onClose: () => void
  item?: Item | null
}) {
  const queryClient = useQueryClient()

  const { data: categories } = useQuery({
    queryKey: qk.itemCategories.list(),
    queryFn: () => itemCategoriesApi.list().then((r) => r.data as ItemCategory[]),
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  useEffect(() => {
    if (!open) return
    if (item) {
      reset({
        code: item.code,
        name: item.name,
        category: item.category ?? 0,
        uom: item.uom,
        item_type: item.item_type,
        reorder_level: parseFloat(item.reorder_level) || 0,
        barcode: item.barcode,
      })
    } else {
      reset(emptyValues)
    }
  }, [open, item, reset])

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = { ...values, reorder_level: values.reorder_level.toFixed(2) }
      return item ? itemsApi.update(item.id, payload) : itemsApi.create(payload)
    },
    onSuccess: () => {
      showToast.success(item ? 'Item updated' : 'Item created')
      queryClient.invalidateQueries({ queryKey: qk.items.all })
      reset(emptyValues)
      onClose()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to save item')),
  })

  return (
    <Modal open={open} onClose={onClose} title={item ? `Edit ${item.code}` : 'New Item'}>
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
        <FormRow>
          <Input label="Code" placeholder="e.g. STAT-001" error={errors.code?.message} {...register('code')} />
          <Input label="Name" error={errors.name?.message} {...register('name')} />
        </FormRow>
        <FormRow>
          <Select label="Category" error={errors.category?.message} {...register('category')}>
            <option value={0}>Select category…</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <Select label="Item type" error={errors.item_type?.message} {...register('item_type')}>
            <option value="stockable">Stockable</option>
            <option value="consumable">Consumable</option>
            <option value="service">Service</option>
          </Select>
        </FormRow>
        <FormRow>
          <Input label="Unit of measure" placeholder="e.g. each, box, ream" error={errors.uom?.message} {...register('uom')} />
          <Input
            type="number"
            step="0.01"
            min="0"
            label="Reorder level"
            error={errors.reorder_level?.message}
            {...register('reorder_level')}
          />
        </FormRow>
        <Input label="Barcode" error={errors.barcode?.message} {...register('barcode')} />
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={isSubmitting || mutation.isPending}>
            {item ? 'Save Changes' : 'Create Item'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
