import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { itemCategoriesApi, itemsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { useOptimisticCreate, useOptimisticUpdate } from '@/hooks/useOptimisticMutation'
import { Button, FormRow, Input, Modal, ModalFooter, Select } from '@/components/ui'
import type { Item, ItemCategory } from '@/types/inventory'

const schema = z.object({
  code: z.string().min(1, 'Code is required'),
  name: z.string().min(2, 'Name is required'),
  category: z.coerce.number().min(1, 'Category is required'),
  uom: z.string().min(1, 'Unit of measure is required'),
  item_type: z.enum(['stockable', 'consumable', 'service']),
  reorder_level: z.coerce.number().min(0).default(0),
  reorder_qty: z.coerce.number().min(0).default(0),
  track_lots: z.boolean().default(false),
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
  reorder_qty: 0,
  track_lots: false,
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
  const { data: categories } = useQuery({
    queryKey: qk.itemCategories.list(),
    queryFn: () => itemCategoriesApi.list({ page_size: 500 }).then((r) => (r.data.results ?? r.data) as ItemCategory[]),
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
        reorder_qty: parseFloat(item.reorder_qty) || 0,
        track_lots: item.track_lots,
        barcode: item.barcode,
      })
    } else {
      reset(emptyValues)
    }
  }, [open, item, reset])

  const closeModal = () => {
    reset(emptyValues)
    onClose()
  }

  const toPayload = (values: FormValues) => ({
    ...values,
    reorder_level: values.reorder_level.toFixed(2),
    reorder_qty: values.reorder_qty.toFixed(2),
  })

  const createMutation = useOptimisticCreate<Item, FormValues>({
    mutationFn: (values) => itemsApi.create(toPayload(values)),
    queryKeyPrefixes: [qk.items.all],
    createPlaceholder: (values) => ({
      id: -Date.now(),
      code: values.code,
      name: values.name,
      category: values.category || null,
      category_name: (categories ?? []).find((c) => c.id === values.category)?.name ?? null,
      uom: values.uom,
      item_type: values.item_type,
      avg_cost: '0.00',
      qty_on_hand: '0.00',
      reorder_level: values.reorder_level.toFixed(2),
      reorder_qty: values.reorder_qty.toFixed(2),
      track_lots: values.track_lots,
      barcode: values.barcode,
      is_low_stock: false,
      suggested_order_qty: '0.00',
      is_active: true,
    }),
    successMessage: 'Item created',
    errorMessage: 'Failed to save item',
    closeModal,
  })

  const updateMutation = useOptimisticUpdate<Item, FormValues & { id: number }>({
    mutationFn: ({ id, ...values }) => itemsApi.update(id, toPayload(values as FormValues)),
    queryKeyPrefixes: [qk.items.all],
    successMessage: 'Item updated',
    errorMessage: 'Failed to save item',
    closeModal,
  })

  const mutation = {
    mutate: (values: FormValues) =>
      item
        ? updateMutation.mutate({ ...values, id: item.id, reorder_level: values.reorder_level } as FormValues & { id: number })
        : createMutation.mutate(values),
    isPending: createMutation.isPending || updateMutation.isPending,
  }

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
          <Input label="Barcode" placeholder="Scanned or printed code" error={errors.barcode?.message} {...register('barcode')} />
        </FormRow>
        <FormRow>
          <Input
            type="number"
            step="0.01"
            min="0"
            label="Reorder level"
            error={errors.reorder_level?.message}
            {...register('reorder_level')}
          />
          <Input
            type="number"
            step="0.01"
            min="0"
            label="Reorder quantity"
            error={errors.reorder_qty?.message}
            {...register('reorder_qty')}
          />
        </FormRow>
        <label className="flex items-start gap-3 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2.5 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800"
            {...register('track_lots')}
          />
          <span className="text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-200">Track lots / batches</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">
              Enables expiry dates and FEFO consumption. Receipts will require a lot code and expiry.
            </span>
          </span>
        </label>
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
