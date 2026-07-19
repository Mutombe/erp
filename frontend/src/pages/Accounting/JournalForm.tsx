import { useMemo } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, Scroll, Trash } from '@phosphor-icons/react'
import { accountsApi, journalsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { showToast, parseApiError } from '@/lib/toast'
import { Button, FormRow, Input, PageHeader, Select } from '@/components/ui'
import type { Account } from '@/types/accounting'

const lineSchema = z.object({
  account: z.coerce.number().min(1, 'Account required'),
  debit_amount: z.coerce.number().min(0).default(0),
  credit_amount: z.coerce.number().min(0).default(0),
  description: z.string().default(''),
})

const schema = z
  .object({
    date: z.string().min(1, 'Date required'),
    description: z.string().min(3, 'Description required'),
    reference: z.string().default(''),
    currency: z.enum(['USD', 'ZWG']),
    lines: z.array(lineSchema).min(2, 'At least two lines'),
  })
  .refine(
    (v) => v.lines.every((l) => (l.debit_amount > 0) !== (l.credit_amount > 0)),
    { message: 'Each line must have either a debit or a credit (not both)', path: ['lines'] }
  )

type FormValues = z.infer<typeof schema>

export default function JournalForm() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: accounts } = useQuery({
    queryKey: qk.accounts.list({ manual: true }),
    queryFn: () => accountsApi.list({ is_active: true }).then((r) => r.data as Account[]),
  })

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: new Date().toISOString().slice(0, 10),
      currency: 'USD',
      description: '',
      reference: '',
      lines: [
        { account: 0, debit_amount: 0, credit_amount: 0, description: '' },
        { account: 0, debit_amount: 0, credit_amount: 0, description: '' },
      ],
    },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })

  const lines = watch('lines')
  const totals = useMemo(() => {
    const debit = lines.reduce((sum, l) => sum + (Number(l.debit_amount) || 0), 0)
    const credit = lines.reduce((sum, l) => sum + (Number(l.credit_amount) || 0), 0)
    return { debit, credit, diff: debit - credit }
  }, [lines])

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      journalsApi.create({
        ...values,
        lines: values.lines.map((l) => ({
          account: l.account,
          debit_amount: l.debit_amount.toFixed(2),
          credit_amount: l.credit_amount.toFixed(2),
          description: l.description,
        })),
      }),
    onSuccess: (r) => {
      showToast.success(`Draft ${r.data.number} created`)
      queryClient.invalidateQueries({ queryKey: qk.journals.all })
      navigate(`/app/journals/${r.data.id}`)
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to create journal')),
  })

  const manualAccounts = (accounts ?? []).filter((a) => a.allow_manual_journal)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manual Journal"
        description="Creates a draft; post it from the detail page once balanced"
        icon={Scroll}
        backLink="/app/journals"
      />

      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-6 max-w-5xl">
        <FormRow>
          <Input type="date" label="Date" error={errors.date?.message} {...register('date')} />
          <Select label="Currency" {...register('currency')}>
            <option value="USD">USD</option>
            <option value="ZWG">ZWG</option>
          </Select>
          <Input label="Reference" {...register('reference')} />
        </FormRow>
        <Input label="Description" error={errors.description?.message} {...register('description')} />

        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-3 py-2.5 w-2/5">Account</th>
                <th className="px-3 py-2.5">Line description</th>
                <th className="px-3 py-2.5 w-32 text-right">Debit</th>
                <th className="px-3 py-2.5 w-32 text-right">Credit</th>
                <th className="px-3 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => (
                <tr key={field.id} className="border-t border-gray-100 dark:border-gray-700/50">
                  <td className="px-3 py-2">
                    <select
                      {...register(`lines.${index}.account`)}
                      className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                    >
                      <option value={0}>Select account…</option>
                      {manualAccounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input {...register(`lines.${index}.description`)}
                      className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" step="0.01" min="0" {...register(`lines.${index}.debit_amount`)}
                      className="w-full px-2 py-1.5 text-sm text-right tabular-nums rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" step="0.01" min="0" {...register(`lines.${index}.credit_amount`)}
                      className="w-full px-2 py-1.5 text-sm text-right tabular-nums rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800" />
                  </td>
                  <td className="px-3 py-2 text-center">
                    {fields.length > 2 && (
                      <button type="button" onClick={() => remove(index)}
                        className="text-gray-400 hover:text-red-500">
                        <Trash className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 dark:bg-gray-800">
              <tr className="font-semibold">
                <td className="px-3 py-2.5" colSpan={2}>
                  <Button type="button" variant="secondary" size="sm"
                    onClick={() => append({ account: 0, debit_amount: 0, credit_amount: 0, description: '' })}>
                    <Plus className="w-4 h-4 mr-1" /> Add line
                  </Button>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{totals.debit.toFixed(2)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{totals.credit.toFixed(2)}</td>
                <td />
              </tr>
              <tr>
                <td colSpan={5} className="px-3 pb-3">
                  {totals.diff !== 0 ? (
                    <span className="text-sm text-red-600 dark:text-red-400">
                      Out of balance by {Math.abs(totals.diff).toFixed(2)}
                    </span>
                  ) : totals.debit > 0 ? (
                    <span className="text-sm text-emerald-600 dark:text-emerald-400">Balanced ✓</span>
                  ) : null}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        {errors.lines && <p className="text-sm text-red-500">{errors.lines.message as string}</p>}

        <div className="flex gap-3">
          <Button type="submit" disabled={totals.diff !== 0 || totals.debit === 0}
            loading={isSubmitting || mutation.isPending}>
            Create Draft Journal
          </Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/app/journals')}>Cancel</Button>
        </div>
      </form>
    </div>
  )
}
