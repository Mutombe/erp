import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { HandCoins, Info } from '@phosphor-icons/react'
import { Badge, Button, EmptyState, Input, Select, SkeletonCard, Textarea, type BadgeVariant } from '@/components/ui'
import { portalApi } from '@/services/api'
import { usePortalContext } from '@/hooks/usePortalContext'
import { formatCurrency, formatDate } from '@/lib/utils'
import { showToast, parseApiError } from '@/lib/toast'
import { PAYMENT_METHODS } from '@/types/fees'
import type { IntentRow, PaymentIntentStatus } from '@/types/portal'

// USD is the base currency; ZWG is the common Zimbabwean secondary. The portal
// context doesn't expose the school's currency list, so we offer both.
const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD' },
  { value: 'ZWG', label: 'ZWG' },
]

const STATUS_VARIANT: Record<PaymentIntentStatus, BadgeVariant> = {
  submitted: 'warning',
  confirmed: 'success',
  rejected: 'danger',
}

const schema = z.object({
  student: z.coerce.number().min(1, 'Please choose a student'),
  amount: z.coerce.number().positive('Enter an amount greater than zero'),
  currency: z.string().min(1, 'Currency is required'),
  payment_method: z.string().min(1, 'Payment method is required'),
  reference: z.string().optional(),
  note: z.string().optional(),
})

type FormValues = z.input<typeof schema>

function DeclarePaymentForm({
  students,
  initialStudent,
}: {
  students: { id: number; name: string; code: string }[]
  initialStudent: string | null
}) {
  const queryClient = useQueryClient()
  const preset = initialStudent && students.some((s) => String(s.id) === initialStudent) ? initialStudent : ''

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      student: preset ? Number(preset) : ('' as unknown as number),
      amount: '' as unknown as number,
      currency: 'USD',
      payment_method: 'cash',
      reference: '',
      note: '',
    },
  })

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const parsed = schema.parse(values)
      return portalApi.createIntent({
        student: parsed.student,
        amount: parsed.amount.toFixed(2),
        currency: parsed.currency,
        payment_method: parsed.payment_method,
        reference: parsed.reference || undefined,
        note: parsed.note || undefined,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal', 'intents'] })
      showToast.success('Payment submitted — your bursar will confirm it.')
      reset({
        student: preset ? Number(preset) : ('' as unknown as number),
        amount: '' as unknown as number,
        currency: 'USD',
        payment_method: 'cash',
        reference: '',
        note: '',
      })
    },
    onError: (error) => showToast.error(parseApiError(error, 'Could not submit your payment.')),
  })

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-5 sm:p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center">
          <HandCoins className="w-5 h-5 text-primary-600 dark:text-primary-300" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Declare a payment</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400">Let the school know about a payment you’ve made.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4" noValidate>
        <Select
          label="Student"
          error={errors.student?.message}
          required
          defaultValue={preset}
          {...register('student')}
        >
          <option value="">Select student…</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} — {s.name}
            </option>
          ))}
        </Select>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            type="number"
            step="0.01"
            min="0"
            label="Amount"
            placeholder="0.00"
            error={errors.amount?.message}
            required
            {...register('amount')}
          />
          <Select
            label="Currency"
            error={errors.currency?.message}
            required
            defaultValue="USD"
            {...register('currency')}
          >
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>

        <Select
          label="Payment method"
          error={errors.payment_method?.message}
          required
          defaultValue="cash"
          {...register('payment_method')}
        >
          {PAYMENT_METHODS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>

        <Input
          label="Reference"
          placeholder="e.g. bank slip or EcoCash reference"
          error={errors.reference?.message}
          {...register('reference')}
        />

        <Textarea label="Note" rows={2} placeholder="Anything the bursar should know (optional)" {...register('note')} />

        <div className="flex items-start gap-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 px-3 py-2.5 text-xs text-blue-700 dark:text-blue-300">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Declaring a payment doesn’t post anything to your account. A bursar reviews and confirms it before it
            appears on the statement.
          </span>
        </div>

        <div className="flex justify-end">
          <Button type="submit" loading={mutation.isPending}>
            Submit payment
          </Button>
        </div>
      </form>
    </div>
  )
}

function IntentsHistory({ isGuardian }: { isGuardian: boolean }) {
  const { data: intents, isLoading } = useQuery({
    queryKey: ['portal', 'intents'],
    queryFn: () => portalApi.listIntents().then((r) => r.data as IntentRow[]),
  })

  if (isLoading) return <SkeletonCard />

  if (!intents || intents.length === 0) {
    return (
      <EmptyState
        icon={HandCoins}
        title="No payments declared yet"
        description={
          isGuardian
            ? 'Payments you declare will appear here with their review status.'
            : 'Payments declared on your account will appear here.'
        }
      />
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-slate-800 text-left text-xs uppercase text-gray-500 dark:text-slate-400">
          <tr>
            <th className="px-4 py-3">Student</th>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3 text-right">Amount</th>
            <th className="px-4 py-3">Method</th>
            <th className="px-4 py-3">Reference</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Outcome</th>
          </tr>
        </thead>
        <tbody>
          {intents.map((intent) => (
            <tr key={intent.id} className="border-t border-gray-100 dark:border-slate-700/50 align-top">
              <td className="px-4 py-2.5">
                <span className="block text-gray-900 dark:text-slate-100">{intent.student_name}</span>
                <span className="block text-xs font-mono text-gray-400 dark:text-slate-500">{intent.student_code}</span>
              </td>
              <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(intent.date)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {formatCurrency(Number(intent.amount), intent.currency)}
              </td>
              <td className="px-4 py-2.5 capitalize">{intent.payment_method.replace(/_/g, ' ')}</td>
              <td className="px-4 py-2.5">{intent.reference || '—'}</td>
              <td className="px-4 py-2.5">
                <Badge variant={STATUS_VARIANT[intent.status] ?? 'default'} dot>
                  <span className="capitalize">{intent.status}</span>
                </Badge>
              </td>
              <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-slate-400 max-w-[16rem]">
                {intent.status === 'confirmed' && intent.receipt_number ? (
                  <span className="text-emerald-600 dark:text-emerald-400">Receipt {intent.receipt_number}</span>
                ) : intent.status === 'rejected' ? (
                  <span className="text-red-600 dark:text-red-400">{intent.review_note || 'Rejected'}</span>
                ) : (
                  'Awaiting bursar'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function PortalPayments() {
  const [searchParams] = useSearchParams()
  const initialStudent = searchParams.get('student')
  const { data: context, isLoading, isError } = usePortalContext()

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  if (isError || !context) {
    return <EmptyState title="Couldn't load payments" description="Please refresh the page and try again." />
  }

  const isGuardian = context.kind === 'guardian'
  const students = context.students.map((s) => ({ id: s.id, name: s.name, code: s.code }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Payments</h1>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
          {isGuardian
            ? 'Declare payments you’ve made and track their confirmation.'
            : 'Payments declared on your account and their status.'}
        </p>
      </div>

      {isGuardian && <DeclarePaymentForm students={students} initialStudent={initialStudent} />}

      <section>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-3">Payment history</h2>
        <IntentsHistory isGuardian={isGuardian} />
      </section>
    </div>
  )
}
