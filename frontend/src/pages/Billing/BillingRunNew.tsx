import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { PlayCircle } from 'lucide-react'
import { billingRunsApi, termsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { showToast, parseApiError } from '@/lib/toast'
import { Button, FormRow, Input, PageHeader, Select } from '@/components/ui'
import type { Term } from '@/types/students'

const schema = z.object({
  term: z.coerce.number().min(1, 'Term is required'),
  currency: z.enum(['USD', 'ZWG']),
  date: z.string().min(1, 'Date is required'),
  due_date: z.string().default(''),
})

type FormValues = z.infer<typeof schema>

export default function BillingRunNew() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: terms } = useQuery({
    queryKey: qk.terms.list(),
    queryFn: () => termsApi.list().then((r) => r.data as Term[]),
  })

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      currency: 'USD',
      date: new Date().toISOString().slice(0, 10),
      due_date: '',
    },
  })

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      billingRunsApi.create({
        term: values.term,
        currency: values.currency,
        date: values.date,
        due_date: values.due_date || null,
      }),
    onSuccess: (r) => {
      showToast.success(`Draft billing run ${r.data.number} created`)
      queryClient.invalidateQueries({ queryKey: qk.billingRuns.all })
      navigate(`/app/billing-runs/${r.data.id}`)
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to create billing run')),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Billing Run"
        description="Creates a draft — preview and execute it from the detail page"
        icon={PlayCircle}
        backLink="/app/billing-runs"
      />

      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-6 max-w-2xl">
        <FormRow>
          <Select label="Term" error={errors.term?.message} {...register('term')}>
            <option value="">Select term…</option>
            {(terms ?? []).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
          <Select label="Currency" error={errors.currency?.message} {...register('currency')}>
            <option value="USD">USD</option>
            <option value="ZWG">ZWG</option>
          </Select>
        </FormRow>
        <FormRow>
          <Input type="date" label="Invoice date" error={errors.date?.message} {...register('date')} />
          <Input type="date" label="Due date (optional)" error={errors.due_date?.message} {...register('due_date')} />
        </FormRow>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          The run bills every actively enrolled student whose grade has fee structures for the
          selected term and currency. Students already billed for the term are skipped.
        </p>
        <div className="flex gap-3">
          <Button type="submit" loading={isSubmitting || mutation.isPending}>Create Draft Run</Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/app/billing-runs')}>Cancel</Button>
        </div>
      </form>
    </div>
  )
}
