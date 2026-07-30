import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { PlayCircle, MagnifyingGlass, X } from '@phosphor-icons/react'
import { classesApi, gradesApi, billingRunsApi, studentsApi, termsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { showToast, parseApiError } from '@/lib/toast'
import { cn, useDebounce } from '@/lib/utils'
import { Button, FormRow, Input, PageHeader, Select } from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import type { ClassRoom, Grade, Student, Term } from '@/types/students'
import { BILLING_SCOPE_OPTIONS, type BillingScope } from '@/types/fees'

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

  const [scope, setScope] = useState<BillingScope>('grades')
  const [gradeIds, setGradeIds] = useState<number[]>([])
  const [classIds, setClassIds] = useState<number[]>([])
  const [students, setStudents] = useState<Student[]>([])

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

  const scopeValid =
    scope === 'whole_school' ||
    (scope === 'grades' && gradeIds.length > 0) ||
    (scope === 'classes' && classIds.length > 0) ||
    (scope === 'students' && students.length > 0)

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      billingRunsApi.create({
        term: values.term,
        currency: values.currency,
        date: values.date,
        due_date: values.due_date || null,
        scope,
        grades: scope === 'grades' ? gradeIds : [],
        classes: scope === 'classes' ? classIds : [],
        students: scope === 'students' ? students.map((s) => s.id) : [],
      }),
    onSuccess: (r) => {
      showToast.success(`Draft billing run ${r.data.number} created`)
      queryClient.invalidateQueries({ queryKey: qk.billingRuns.all })
      navigate(`/app/billing-runs/${r.data.id}`)
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to create billing run')),
  })

  const submit = (values: FormValues) => {
    if (!scopeValid) {
      showToast.error('Select at least one target for the chosen scope')
      return
    }
    mutation.mutate(values)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Billing Run"
        description="Creates a draft — preview and execute it from the detail page"
        icon={PlayCircle}
        backLink="/app/billing-runs"
      />

      <form onSubmit={handleSubmit(submit)} className="space-y-6 max-w-2xl">
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

        {/* Scope selector */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">Who to bill</label>
          <div className="flex flex-wrap gap-2">
            {BILLING_SCOPE_OPTIONS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setScope(value)}
                className={cn(
                  'px-3.5 py-1.5 text-sm rounded-full border transition-colors',
                  scope === value
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {scope === 'whole_school' && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Every actively enrolled student with matching fee structures will be billed.
            </p>
          )}
          {scope === 'grades' && <GradePicker selected={gradeIds} onChange={setGradeIds} />}
          {scope === 'classes' && <ClassPicker selected={classIds} onChange={setClassIds} />}
          {scope === 'students' && <StudentPicker selected={students} onChange={setStudents} />}
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          The run bills matching students whose grade has fee structures for the selected term and
          currency. Students already billed for the term are skipped.
        </p>
        <div className="flex gap-3">
          <Button type="submit" loading={isSubmitting || mutation.isPending}>Create Draft Run</Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/app/billing-runs')}>Cancel</Button>
        </div>
      </form>
    </div>
  )
}

// --- Multi-select pickers ----------------------------------------------------

function chipToggle(ids: number[], id: number): number[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
}

function GradePicker({ selected, onChange }: { selected: number[]; onChange: (v: number[]) => void }) {
  const { data: grades } = useQuery({
    queryKey: qk.grades.list(),
    queryFn: () => gradesApi.list({ page_size: 500 }).then((r) => (r.data.results ?? r.data) as Grade[]),
  })
  return (
    <div className="flex flex-wrap gap-2">
      {(grades ?? []).map((g) => (
        <ToggleChip key={g.id} active={selected.includes(g.id)} onClick={() => onChange(chipToggle(selected, g.id))}>
          {g.name}
        </ToggleChip>
      ))}
      {(grades ?? []).length === 0 && <p className="text-sm text-gray-500">No grades available.</p>}
    </div>
  )
}

function ClassPicker({ selected, onChange }: { selected: number[]; onChange: (v: number[]) => void }) {
  const { data: classes } = useQuery({
    queryKey: qk.classes.list({ all: 1 }),
    queryFn: () =>
      classesApi.list({ page_size: 500 }).then((r) => (r.data as Paginated<ClassRoom>).results ?? (r.data as ClassRoom[])),
  })
  return (
    <div className="flex flex-wrap gap-2">
      {(classes ?? []).map((c) => (
        <ToggleChip key={c.id} active={selected.includes(c.id)} onClick={() => onChange(chipToggle(selected, c.id))}>
          {c.name}
        </ToggleChip>
      ))}
      {(classes ?? []).length === 0 && <p className="text-sm text-gray-500">No classes available.</p>}
    </div>
  )
}

function StudentPicker({ selected, onChange }: { selected: Student[]; onChange: (v: Student[]) => void }) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const debounced = useDebounce(search, 300)

  const { data: results } = useQuery({
    queryKey: qk.students.list({ picker: debounced }),
    queryFn: () =>
      studentsApi.list({ search: debounced, page_size: 20 }).then((r) => (r.data as Paginated<Student>).results),
    enabled: debounced.length >= 1,
    placeholderData: keepPreviousData,
  })

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected])
  const add = (s: Student) => {
    if (!selectedIds.has(s.id)) onChange([...selected, s])
    setSearch('')
    setOpen(false)
  }

  return (
    <div className="space-y-2">
      <div className="relative max-w-md">
        <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search students by name or code…"
          className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200"
        />
        {open && debounced.length >= 1 && (results ?? []).length > 0 && (
          <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden dark:bg-slate-900 dark:border-slate-600">
            <div className="max-h-60 overflow-y-auto p-1">
              {(results ?? []).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => add(s)}
                  disabled={selectedIds.has(s.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm rounded-lg text-gray-700 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800 disabled:opacity-40"
                >
                  <span className="font-mono text-xs text-gray-500">{s.code}</span>
                  {s.full_name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 text-xs font-medium rounded-full bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
            >
              <span className="font-mono">{s.code}</span> {s.full_name}
              <button type="button" onClick={() => onChange(selected.filter((x) => x.id !== s.id))} aria-label="Remove">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function ToggleChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 text-sm rounded-full border transition-colors',
        active
          ? 'bg-primary-600 text-white border-primary-600'
          : 'border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800'
      )}
    >
      {children}
    </button>
  )
}
