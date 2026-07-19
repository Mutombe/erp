import { useEffect, useMemo } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, ShoppingCart, Trash } from '@phosphor-icons/react'
import { accountsApi, itemsApi, purchaseOrdersApi, suppliersApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { showToast, parseApiError } from '@/lib/toast'
import { Button, FormRow, Input, PageHeader, Select } from '@/components/ui'
import type { Account, Paginated } from '@/types/accounting'
import type { Item } from '@/types/inventory'
import { money, type Supplier } from '@/types/procurement'

const lineSchema = z.object({
  item: z.coerce.number().min(0).default(0),
  expense_account: z.coerce.number().min(0).default(0),
  description: z.string().default(''),
  quantity: z.coerce.number().positive('Qty must be positive'),
  unit_price: z.coerce.number().min(0, 'Price required'),
})

const schema = z
  .object({
    supplier: z.coerce.number().min(1, 'Supplier is required'),
    date: z.string().min(1, 'Date is required'),
    expected_date: z.string().default(''),
    currency: z.enum(['USD', 'ZWG']),
    notes: z.string().default(''),
    lines: z.array(lineSchema).min(1, 'At least one line'),
  })
  .refine((v) => v.lines.every((l) => l.item > 0 || l.expense_account > 0), {
    message: 'Every line needs an item or an expense account',
    path: ['lines'],
  })

type FormValues = z.infer<typeof schema>

const emptyLine = { item: 0, expense_account: 0, description: '', quantity: 1, unit_price: 0 }

export default function PurchaseOrderForm() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: suppliers } = useQuery({
    queryKey: qk.suppliers.list({ for: 'select' }),
    queryFn: () =>
      suppliersApi
        .list({ is_active: true, page_size: 500 })
        .then((r) => (r.data as Paginated<Supplier>).results),
  })

  const { data: items } = useQuery({
    queryKey: qk.items.list({ for: 'select' }),
    queryFn: () =>
      itemsApi.list({ is_active: true, page_size: 500 }).then((r) => (r.data as Paginated<Item>).results),
  })

  const { data: accounts } = useQuery({
    queryKey: qk.accounts.list({ is_active: true }),
    queryFn: () => accountsApi.list({ is_active: true }).then((r) => r.data as Account[]),
  })
  const expenseAccounts = (accounts ?? []).filter((a) => a.account_type === 'expense')

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      supplier: 0,
      date: new Date().toISOString().slice(0, 10),
      expected_date: '',
      currency: 'USD',
      notes: '',
      lines: [{ ...emptyLine }],
    },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })

  // Default currency follows the chosen supplier.
  const supplierId = watch('supplier')
  useEffect(() => {
    const supplier = (suppliers ?? []).find((s) => s.id === Number(supplierId))
    if (supplier && (supplier.default_currency === 'USD' || supplier.default_currency === 'ZWG')) {
      setValue('currency', supplier.default_currency)
    }
  }, [supplierId, suppliers, setValue])

  const lines = watch('lines')
  const total = useMemo(
    () => lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0),
    [lines]
  )

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      purchaseOrdersApi.create({
        supplier: values.supplier,
        date: values.date,
        expected_date: values.expected_date || null,
        currency: values.currency,
        notes: values.notes,
        lines: values.lines.map((l) => ({
          item: l.item || null,
          expense_account: l.expense_account || null,
          description: l.description,
          quantity: l.quantity.toFixed(2),
          unit_price: l.unit_price.toFixed(2),
        })),
      }),
    onSuccess: (r) => {
      showToast.success(`Draft ${r.data.number} created`)
      queryClient.invalidateQueries({ queryKey: qk.purchaseOrders.all })
      navigate(`/app/purchase-orders/${r.data.id}`)
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to create purchase order')),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Purchase Order"
        description="Creates a draft; approve it from the detail page"
        icon={ShoppingCart}
        backLink="/app/purchase-orders"
      />

      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-6 max-w-6xl">
        <FormRow>
          <Select label="Supplier" error={errors.supplier?.message} {...register('supplier')}>
            <option value={0}>Select supplier…</option>
            {(suppliers ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.code} · {s.name}</option>
            ))}
          </Select>
          <Input type="date" label="Date" error={errors.date?.message} {...register('date')} />
          <Input type="date" label="Expected delivery" error={errors.expected_date?.message} {...register('expected_date')} />
          <Select label="Currency" error={errors.currency?.message} {...register('currency')}>
            <option value="USD">USD</option>
            <option value="ZWG">ZWG</option>
          </Select>
        </FormRow>
        <Input label="Notes" {...register('notes')} />

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-3 py-2.5 w-1/4">Item</th>
                <th className="px-3 py-2.5 w-1/4">…or expense account</th>
                <th className="px-3 py-2.5">Description</th>
                <th className="px-3 py-2.5 w-24 text-right">Qty</th>
                <th className="px-3 py-2.5 w-28 text-right">Unit price</th>
                <th className="px-3 py-2.5 w-28 text-right">Line total</th>
                <th className="px-3 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => {
                const line = lines[index]
                const lineTotal = (Number(line?.quantity) || 0) * (Number(line?.unit_price) || 0)
                return (
                  <tr key={field.id} className="border-t border-gray-100 dark:border-gray-700/50">
                    <td className="px-3 py-2">
                      <select
                        {...register(`lines.${index}.item`)}
                        className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                      >
                        <option value={0}>None (expense line)</option>
                        {(items ?? []).map((i) => (
                          <option key={i.id} value={i.id}>{i.code} · {i.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        {...register(`lines.${index}.expense_account`)}
                        className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                      >
                        <option value={0}>None (item line)</option>
                        {expenseAccounts.map((a) => (
                          <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        {...register(`lines.${index}.description`)}
                        className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number" step="0.01" min="0"
                        {...register(`lines.${index}.quantity`)}
                        className="w-full px-2 py-1.5 text-sm text-right tabular-nums rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number" step="0.01" min="0"
                        {...register(`lines.${index}.unit_price`)}
                        className="w-full px-2 py-1.5 text-sm text-right tabular-nums rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(lineTotal)}</td>
                    <td className="px-3 py-2 text-center">
                      {fields.length > 1 && (
                        <button type="button" onClick={() => remove(index)} className="text-gray-400 hover:text-red-500">
                          <Trash className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold">
              <tr>
                <td className="px-3 py-2.5" colSpan={5}>
                  <Button type="button" variant="secondary" size="sm" onClick={() => append({ ...emptyLine })}>
                    <Plus className="w-4 h-4 mr-1" /> Add line
                  </Button>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{money(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        {errors.lines && <p className="text-sm text-red-500">{errors.lines.message as string}</p>}

        <div className="flex gap-3">
          <Button type="submit" loading={isSubmitting || mutation.isPending}>
            Create Draft PO
          </Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/app/purchase-orders')}>Cancel</Button>
        </div>
      </form>
    </div>
  )
}
