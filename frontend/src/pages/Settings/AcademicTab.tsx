import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarBlank, Plus, Star } from '@phosphor-icons/react'
import { academicYearsApi, termsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { showToast, parseApiError } from '@/lib/toast'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  FormRow,
  Input,
  Modal,
  ModalFooter,
  Select,
  SkeletonTable,
} from '@/components/ui'

interface Term {
  id: number
  academic_year: number
  number: number
  name: string
  start_date: string
  end_date: string
  is_current: boolean
}

interface AcademicYear {
  id: number
  name: string
  start_date: string
  end_date: string
  is_current: boolean
  terms: Term[]
}

interface YearFormValues { name: string; start_date: string; end_date: string }
interface TermFormValues { academic_year: string; number: string; name: string; start_date: string; end_date: string }

function YearModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const { register, handleSubmit, formState: { errors } } = useForm<YearFormValues>()

  const mutation = useMutation({
    mutationFn: (values: YearFormValues) => academicYearsApi.create(values),
    onSuccess: () => {
      showToast.success('Academic year created')
      queryClient.invalidateQueries({ queryKey: qk.academicYears.all })
      onClose()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to create academic year')),
  })

  return (
    <Modal open onClose={onClose} title="New Academic Year" icon={CalendarBlank}>
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
        <Input label="Name" required placeholder="e.g. 2026" error={errors.name?.message}
          {...register('name', { required: 'Name is required' })} />
        <FormRow>
          <Input label="Start date" type="date" required error={errors.start_date?.message}
            {...register('start_date', { required: 'Required' })} />
          <Input label="End date" type="date" required error={errors.end_date?.message}
            {...register('end_date', { required: 'Required' })} />
        </FormRow>
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={mutation.isPending}>Create Year</Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}

function TermModal({ years, defaultYear, onClose }: { years: AcademicYear[]; defaultYear?: number; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { register, handleSubmit, formState: { errors } } = useForm<TermFormValues>({
    defaultValues: { academic_year: defaultYear ? String(defaultYear) : '' },
  })

  const mutation = useMutation({
    mutationFn: (values: TermFormValues) =>
      termsApi.create({
        academic_year: Number(values.academic_year),
        number: Number(values.number),
        name: values.name,
        start_date: values.start_date,
        end_date: values.end_date,
      }),
    onSuccess: () => {
      showToast.success('Term created')
      queryClient.invalidateQueries({ queryKey: qk.terms.all })
      queryClient.invalidateQueries({ queryKey: qk.academicYears.all })
      onClose()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to create term')),
  })

  return (
    <Modal open onClose={onClose} title="New Term" icon={CalendarBlank}>
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
        <FormRow>
          <Select label="Academic year" required error={errors.academic_year?.message}
            defaultValue={defaultYear ? String(defaultYear) : ''}
            options={years.map((y) => ({ value: String(y.id), label: y.name }))}
            {...register('academic_year', { required: 'Required' })} />
          <Input label="Term number" required placeholder="1, 2 or 3" error={errors.number?.message}
            {...register('number', { required: 'Required', pattern: { value: /^\d+$/, message: 'Whole number' } })} />
        </FormRow>
        <Input label="Name" required placeholder="e.g. Term 1 2026" error={errors.name?.message}
          {...register('name', { required: 'Name is required' })} />
        <FormRow>
          <Input label="Start date" type="date" required error={errors.start_date?.message}
            {...register('start_date', { required: 'Required' })} />
          <Input label="End date" type="date" required error={errors.end_date?.message}
            {...register('end_date', { required: 'Required' })} />
        </FormRow>
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={mutation.isPending}>Create Term</Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}

export default function AcademicTab() {
  const queryClient = useQueryClient()
  const [showYearModal, setShowYearModal] = useState(false)
  const [termModalYear, setTermModalYear] = useState<number | 'closed'>('closed')
  const [currentTarget, setCurrentTarget] = useState<{ kind: 'year' | 'term'; id: number; name: string } | null>(null)

  const { data: years, isLoading } = useQuery({
    queryKey: qk.academicYears.list(),
    queryFn: () => academicYearsApi.list().then((r) => r.data as AcademicYear[]),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: qk.academicYears.all })
    queryClient.invalidateQueries({ queryKey: qk.terms.all })
    queryClient.invalidateQueries({ queryKey: qk.settings.all })
    queryClient.invalidateQueries({ queryKey: qk.reports.all })
  }

  const setCurrentMutation = useMutation({
    mutationFn: (target: { kind: 'year' | 'term'; id: number }) =>
      target.kind === 'year'
        ? academicYearsApi.update(target.id, { is_current: true })
        : termsApi.update(target.id, { is_current: true }),
    onSuccess: (_, target) => {
      showToast.success(target.kind === 'year' ? 'Current academic year updated' : 'Current term updated')
      invalidate()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to update')),
  })

  if (isLoading || !years) return <SkeletonTable rows={6} />

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setTermModalYear(years.find((y) => y.is_current)?.id ?? 0)}>
          <Plus className="w-4 h-4 mr-2" /> New Term
        </Button>
        <Button onClick={() => setShowYearModal(true)}>
          <Plus className="w-4 h-4 mr-2" /> New Academic Year
        </Button>
      </div>

      {years.length === 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 py-12 text-center text-gray-400">
          No academic years yet. Create one to start enrolling and billing.
        </div>
      )}

      {years.map((year) => (
        <Card key={year.id} padding="md">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{year.name}</h3>
              <span className="text-sm text-gray-500">{year.start_date} → {year.end_date}</span>
              {year.is_current && <Badge variant="success" dot>Current</Badge>}
            </div>
            <div className="flex items-center gap-2">
              {!year.is_current && (
                <Button size="sm" variant="outline"
                  onClick={() => setCurrentTarget({ kind: 'year', id: year.id, name: year.name })}>
                  <Star className="w-3.5 h-3.5 mr-1.5" /> Set current
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setTermModalYear(year.id)}>
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Add term
              </Button>
            </div>
          </div>

          {year.terms.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">No terms defined for this year.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-100 dark:border-gray-700/50">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-2.5 w-16">#</th>
                    <th className="px-4 py-2.5">Term</th>
                    <th className="px-4 py-2.5">Start</th>
                    <th className="px-4 py-2.5">End</th>
                    <th className="px-4 py-2.5 w-28">Status</th>
                    <th className="px-4 py-2.5 text-right w-32" />
                  </tr>
                </thead>
                <tbody>
                  {year.terms.map((term) => (
                    <tr key={term.id} className="border-t border-gray-100 dark:border-gray-700/50">
                      <td className="px-4 py-2.5 tabular-nums">{term.number}</td>
                      <td className="px-4 py-2.5 font-medium">{term.name}</td>
                      <td className="px-4 py-2.5">{term.start_date}</td>
                      <td className="px-4 py-2.5">{term.end_date}</td>
                      <td className="px-4 py-2.5">
                        {term.is_current ? <Badge variant="success" dot>Current</Badge> : <span className="text-gray-400 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {!term.is_current && (
                          <Button size="sm" variant="ghost"
                            onClick={() => setCurrentTarget({ kind: 'term', id: term.id, name: term.name })}>
                            <Star className="w-3.5 h-3.5 mr-1.5" /> Set current
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ))}

      {showYearModal && <YearModal onClose={() => setShowYearModal(false)} />}
      {termModalYear !== 'closed' && (
        <TermModal
          years={years}
          defaultYear={termModalYear || undefined}
          onClose={() => setTermModalYear('closed')}
        />
      )}

      <ConfirmDialog
        open={!!currentTarget}
        onClose={() => setCurrentTarget(null)}
        onConfirm={() => {
          if (currentTarget) setCurrentMutation.mutate(currentTarget)
          setCurrentTarget(null)
        }}
        title={`Make ${currentTarget?.name ?? ''} the current ${currentTarget?.kind ?? ''}?`}
        message="Billing runs, dashboards and enrollment default to the current academic year and term."
        confirmText="Set current"
        variant="info"
      />
    </div>
  )
}
