import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowsLeftRight, Bank, Package, Student as StudentIcon, Info } from '@phosphor-icons/react'
import { bankAccountsApi, classesApi, itemsApi, studentsApi, transfersApi, warehousesApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { useDebounce, formatCurrency } from '@/lib/utils'
import { showToast, parseApiError } from '@/lib/toast'
import { useAuthStore } from '@/stores/authStore'
import {
  AsyncSelect,
  Button,
  FormRow,
  Input,
  Modal,
  ModalFooter,
  Select,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Textarea,
} from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import type { ClassRoom, Student } from '@/types/students'
import type { Item, Warehouse } from '@/types/inventory'
import type { Transfer, TransferBank, TransferStudentPreview } from '@/types/transfers'

const TODAY = () => new Date().toISOString().slice(0, 10)

export default function TransferFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const activeSchool = useAuthStore((s) => s.activeSchool)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New inter-school transfer"
      description="Move funds or a pupil between two Golden Knot schools"
      icon={ArrowsLeftRight}
      size="2xl"
    >
      {activeSchool && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            You are scoped to <span className="font-medium">{activeSchool.name}</span>. Switch to
            “Golden Knot — All schools” in the header for full cross-school visibility of accounts
            and pupils.
          </span>
        </div>
      )}

      <Tabs defaultValue="funds">
        <TabsList className="mb-5">
          <TabsTrigger value="funds" icon={Bank}>
            Funds
          </TabsTrigger>
          <TabsTrigger value="student" icon={StudentIcon}>
            Student
          </TabsTrigger>
          <TabsTrigger value="stock" icon={Package}>
            Stock
          </TabsTrigger>
        </TabsList>

        <TabsContent value="funds">
          <FundsTransferForm open={open} onClose={onClose} />
        </TabsContent>
        <TabsContent value="student">
          <StudentTransferForm open={open} onClose={onClose} />
        </TabsContent>
        <TabsContent value="stock">
          <StockTransferForm open={open} onClose={onClose} />
        </TabsContent>
      </Tabs>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Funds
// ---------------------------------------------------------------------------

const fundsSchema = z.object({
  from_school: z.coerce.number().min(1, 'Select the sending school'),
  from_bank: z.coerce.number().min(1, 'Select the sending account'),
  to_school: z.coerce.number().min(1, 'Select the receiving school'),
  to_bank: z.coerce.number().min(1, 'Select the receiving account'),
  amount: z.coerce.number().positive('Amount must be positive'),
  date: z.string().min(1, 'Date is required'),
  note: z.string().default(''),
})

type FundsValues = z.infer<typeof fundsSchema>

function useActiveBanks(open: boolean) {
  return useQuery({
    queryKey: qk.bankAccounts.list({ active: true, all: true }),
    queryFn: () =>
      bankAccountsApi
        .list({ is_active: true, page_size: 500 })
        .then((r) => (r.data.results ?? r.data) as TransferBank[]),
    enabled: open,
  })
}

function FundsTransferForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const schools = useAuthStore((s) => s.accessibleSchools)
  const { data: banks } = useActiveBanks(open)

  const {
    register,
    control,
    watch,
    setValue,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FundsValues>({
    resolver: zodResolver(fundsSchema),
    defaultValues: { from_school: 0, from_bank: 0, to_school: 0, to_bank: 0, date: TODAY(), note: '' },
  })

  const fromSchool = Number(watch('from_school')) || 0
  const toSchool = Number(watch('to_school')) || 0
  const fromBankId = Number(watch('from_bank')) || 0
  const toBankId = Number(watch('to_bank')) || 0
  const amount = Number(watch('amount')) || 0

  const allBanks = banks ?? []
  const fromBank = allBanks.find((b) => b.id === fromBankId)
  const toBank = allBanks.find((b) => b.id === toBankId)

  const fromBanks = useMemo(
    () => allBanks.filter((b) => b.school === fromSchool),
    [allBanks, fromSchool]
  )
  const toBanks = useMemo(
    () => allBanks.filter((b) => b.school === toSchool && (!fromBank || b.currency === fromBank.currency)),
    [allBanks, toSchool, fromBank]
  )

  // Reset a dependent account when its school changes or it falls out of the
  // currency-constrained option set.
  useEffect(() => {
    if (fromBankId && !fromBanks.some((b) => b.id === fromBankId)) setValue('from_bank', 0)
  }, [fromBanks, fromBankId, setValue])
  useEffect(() => {
    if (toBankId && !toBanks.some((b) => b.id === toBankId)) setValue('to_bank', 0)
  }, [toBanks, toBankId, setValue])

  const differentSchools = fromSchool > 0 && toSchool > 0 && fromSchool !== toSchool
  const sameCurrency = !!fromBank && !!toBank && fromBank.currency === toBank.currency
  const canSubmit = differentSchools && !!fromBank && !!toBank && sameCurrency && amount > 0

  const mutation = useMutation({
    mutationFn: (values: FundsValues) =>
      transfersApi.funds({
        from_bank: values.from_bank,
        to_bank: values.to_bank,
        amount: values.amount.toFixed(2),
        date: values.date,
        note: values.note,
      }),
    onSuccess: (r) => {
      const t = r.data as Transfer
      showToast.success(`Transfer ${t.number} completed`)
      queryClient.invalidateQueries({ queryKey: qk.transfers.all })
      queryClient.invalidateQueries({ queryKey: qk.bankAccounts.all })
      queryClient.invalidateQueries({ queryKey: qk.journals.all })
      queryClient.invalidateQueries({ queryKey: qk.reports.all })
      reset()
      onClose()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to transfer funds')),
  })

  const schoolOptions = (exclude: number) =>
    schools.filter((s) => s.id !== exclude)

  return (
    <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
      <FormRow>
        <Controller
          control={control}
          name="from_school"
          render={({ field }) => (
            <Select
              label="From school"
              value={String(field.value || '')}
              onChange={(e) => field.onChange(Number(e.target.value) || 0)}
              error={errors.from_school?.message}
              required
            >
              <option value="">Select school…</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        />
        <Controller
          control={control}
          name="from_bank"
          render={({ field }) => (
            <Select
              label="From account"
              value={String(field.value || '')}
              onChange={(e) => field.onChange(Number(e.target.value) || 0)}
              error={errors.from_bank?.message}
              disabled={!fromSchool}
              required
            >
              <option value="">
                {fromSchool ? (fromBanks.length ? 'Select account…' : 'No active accounts') : 'Pick a school first'}
              </option>
              {fromBanks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.currency})
                </option>
              ))}
            </Select>
          )}
        />
      </FormRow>

      <FormRow>
        <Controller
          control={control}
          name="to_school"
          render={({ field }) => (
            <Select
              label="To school"
              value={String(field.value || '')}
              onChange={(e) => field.onChange(Number(e.target.value) || 0)}
              error={errors.to_school?.message}
              required
            >
              <option value="">Select school…</option>
              {schoolOptions(fromSchool).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        />
        <Controller
          control={control}
          name="to_bank"
          render={({ field }) => (
            <Select
              label="To account"
              value={String(field.value || '')}
              onChange={(e) => field.onChange(Number(e.target.value) || 0)}
              error={errors.to_bank?.message}
              disabled={!toSchool}
              required
            >
              <option value="">
                {toSchool
                  ? toBanks.length
                    ? 'Select account…'
                    : fromBank
                      ? `No ${fromBank.currency} accounts`
                      : 'No active accounts'
                  : 'Pick a school first'}
              </option>
              {toBanks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.currency})
                </option>
              ))}
            </Select>
          )}
        />
      </FormRow>

      <FormRow>
        <Input
          type="number"
          step="0.01"
          min="0"
          label={fromBank ? `Amount (${fromBank.currency})` : 'Amount'}
          error={errors.amount?.message}
          {...register('amount')}
        />
        <Input type="date" label="Date" error={errors.date?.message} {...register('date')} />
      </FormRow>

      <Textarea label="Note (optional)" rows={2} error={errors.note?.message} {...register('note')} />

      <p className="text-xs text-gray-500 dark:text-slate-400">
        Both accounts must be the same currency but belong to different schools. This posts a
        settlement journal in each school and completes immediately.
      </p>

      <ModalFooter>
        <Button variant="secondary" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting || mutation.isPending} disabled={!canSubmit}>
          Transfer funds
        </Button>
      </ModalFooter>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Student
// ---------------------------------------------------------------------------

const studentSchema = z.object({
  from_school: z.coerce.number().min(1, 'Select the current school'),
  from_student: z.coerce.number().min(1, 'Select the pupil'),
  to_school: z.coerce.number().min(1, 'Select the receiving school'),
  to_class: z.coerce.number().min(1, 'Select the destination class'),
  date: z.string().min(1, 'Date is required'),
  note: z.string().default(''),
})

type StudentValues = z.infer<typeof studentSchema>

function BalancePreview({ preview, loading }: { preview?: TransferStudentPreview; loading: boolean }) {
  if (loading) {
    return <p className="text-sm text-gray-400 dark:text-slate-500">Checking outstanding balance…</p>
  }
  if (!preview) return null

  const lines = (preview.balances ?? []).filter((b) => Number(b.amount) !== 0)
  if (lines.length === 0) {
    return <p className="text-sm text-emerald-600 dark:text-emerald-400">No outstanding balance to carry across.</p>
  }
  return (
    <div className="space-y-1">
      {lines.map((b) => {
        const amt = Number(b.amount)
        return amt > 0 ? (
          <p key={b.currency} className="text-sm text-gray-700 dark:text-slate-300">
            Carries a balance of{' '}
            <span className="font-medium">{formatCurrency(amt, b.currency)}</span> to the new school.
          </p>
        ) : (
          <p key={b.currency} className="text-sm text-emerald-600 dark:text-emerald-400">
            Prepaid <span className="font-medium">{formatCurrency(Math.abs(amt), b.currency)}</span> —
            carried across as a credit.
          </p>
        )
      })}
    </div>
  )
}

function StudentTransferForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const schools = useAuthStore((s) => s.accessibleSchools)
  const [studentSearch, setStudentSearch] = useState('')
  const debouncedSearch = useDebounce(studentSearch, 300)

  const {
    control,
    register,
    watch,
    setValue,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<StudentValues>({
    resolver: zodResolver(studentSchema),
    defaultValues: { from_school: 0, from_student: 0, to_school: 0, to_class: 0, date: TODAY(), note: '' },
  })

  const fromSchool = Number(watch('from_school')) || 0
  const studentId = Number(watch('from_student')) || 0
  const toSchool = Number(watch('to_school')) || 0

  // Enrolled students in the sending school (scoped server-side via ?school=).
  const { data: studentPage, isLoading: studentsLoading } = useQuery({
    queryKey: qk.students.list({ picker: 'transfer', search: debouncedSearch, school: fromSchool }),
    queryFn: () =>
      studentsApi
        .list({
          search: debouncedSearch || undefined, status: 'enrolled', page_size: 100,
          school: fromSchool || undefined,
        })
        .then((r) => r.data as Paginated<Student>),
    enabled: open && fromSchool > 0,
  })

  const { data: preview, isFetching: previewLoading } = useQuery({
    queryKey: qk.transfers.detail(`preview-${studentId}`),
    queryFn: () => transfersApi.studentPreview(studentId).then((r) => r.data as TransferStudentPreview),
    enabled: open && studentId > 0,
  })

  // Destination classes in the receiving school (scoped server-side via ?school=).
  const { data: classes } = useQuery({
    queryKey: qk.classes.list({ picker: 'transfer', school: toSchool }),
    queryFn: () =>
      classesApi
        .list({ page_size: 500, school: toSchool || undefined })
        .then((r) => (r.data.results ?? r.data) as ClassRoom[]),
    enabled: open && toSchool > 0,
  })

  const studentOptions = useMemo(
    () =>
      (studentPage?.results ?? []).map((s) => ({
        value: s.id,
        label: `${s.code} — ${s.full_name}`,
        description: s.current_class ?? undefined,
      })),
    [studentPage]
  )

  const classOptions = useMemo(
    () =>
      (classes ?? []).map((c) => ({
        value: c.id,
        label: `${c.name} · ${c.grade_name}`,
      })),
    [classes]
  )

  // The pupil's real current school (from the preview) is the authoritative
  // source school — exclude it from the destination and guard against it.
  const sourceSchoolId = preview?.school ?? fromSchool
  const schoolName = (id: number) => schools.find((s) => s.id === id)?.name ?? `#${id}`
  const schoolMismatch = preview && fromSchool > 0 && preview.school !== fromSchool

  useEffect(() => {
    if (toSchool && toSchool === sourceSchoolId) setValue('to_class', 0)
  }, [toSchool, sourceSchoolId, setValue])

  const differentSchools = toSchool > 0 && sourceSchoolId > 0 && toSchool !== sourceSchoolId
  const canSubmit = studentId > 0 && Number(watch('to_class')) > 0 && differentSchools

  const mutation = useMutation({
    mutationFn: (values: StudentValues) =>
      transfersApi.student({
        from_student: values.from_student,
        to_class: values.to_class,
        date: values.date,
        note: values.note,
      }),
    onSuccess: (r) => {
      const t = r.data as Transfer
      showToast.success(`Transferred — new record ${t.to_student_code ?? ''} opened`.trim())
      queryClient.invalidateQueries({ queryKey: qk.transfers.all })
      queryClient.invalidateQueries({ queryKey: qk.students.all })
      queryClient.invalidateQueries({ queryKey: qk.journals.all })
      queryClient.invalidateQueries({ queryKey: qk.reports.all })
      reset()
      onClose()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to transfer student')),
  })

  return (
    <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
      <Controller
        control={control}
        name="from_school"
        render={({ field }) => (
          <Select
            label="From school"
            value={String(field.value || '')}
            onChange={(e) => field.onChange(Number(e.target.value) || 0)}
            error={errors.from_school?.message}
            required
          >
            <option value="">Select school…</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        )}
      />

      <Controller
        control={control}
        name="from_student"
        render={({ field }) => (
          <AsyncSelect
            label="Pupil"
            placeholder="Search admission code or name…"
            value={field.value || null}
            onChange={(v) => field.onChange(Number(v) || 0)}
            options={studentOptions}
            isLoading={studentsLoading}
            searchable
            onSearch={setStudentSearch}
            error={errors.from_student?.message}
            emptyMessage="No enrolled pupils found"
            required
          />
        )}
      />

      {studentId > 0 && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/50">
          <BalancePreview preview={preview} loading={previewLoading} />
          {schoolMismatch && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              This pupil is currently enrolled at {schoolName(preview!.school)}.
            </p>
          )}
        </div>
      )}

      <FormRow>
        <Controller
          control={control}
          name="to_school"
          render={({ field }) => (
            <Select
              label="To school"
              value={String(field.value || '')}
              onChange={(e) => field.onChange(Number(e.target.value) || 0)}
              error={errors.to_school?.message}
              required
            >
              <option value="">Select school…</option>
              {schools
                .filter((s) => s.id !== sourceSchoolId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </Select>
          )}
        />
        <Controller
          control={control}
          name="to_class"
          render={({ field }) => (
            <AsyncSelect
              label="Destination class"
              placeholder="Search class…"
              value={field.value || null}
              onChange={(v) => field.onChange(Number(v) || 0)}
              options={classOptions}
              searchable
              disabled={!toSchool}
              error={errors.to_class?.message}
              emptyMessage="No classes found"
              required
            />
          )}
        />
      </FormRow>

      <FormRow>
        <Input type="date" label="Date" error={errors.date?.message} {...register('date')} />
        <Textarea label="Note (optional)" rows={1} error={errors.note?.message} {...register('note')} />
      </FormRow>

      <p className="flex items-start gap-2 text-xs text-gray-500 dark:text-slate-400">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          A new student record is opened in the destination school; the balance is carried across by
          an inter-unit settlement. Historical invoices stay with the current school.
        </span>
      </p>

      <ModalFooter>
        <Button variant="secondary" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting || mutation.isPending} disabled={!canSubmit}>
          Transfer pupil
        </Button>
      </ModalFooter>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------------

const stockSchema = z.object({
  from_school: z.coerce.number().min(1, 'Select the sending school'),
  from_warehouse: z.coerce.number().min(1, 'Select the source warehouse'),
  from_item: z.coerce.number().min(1, 'Select the item to send'),
  to_school: z.coerce.number().min(1, 'Select the receiving school'),
  to_warehouse: z.coerce.number().min(1, 'Select the destination warehouse'),
  to_item: z.coerce.number().min(1, 'Select the receiving item'),
  quantity: z.coerce.number().positive('Quantity must be positive'),
  date: z.string().min(1, 'Date is required'),
  note: z.string().default(''),
})

type StockValues = z.infer<typeof stockSchema>

/** Warehouses/items for a school. The `school` query param is passed per the
 *  API contract; when the backend does not narrow by it, all accessible rows
 *  are returned and the backend still validates cross-school consistency. */
function useSchoolWarehouses(school: number, open: boolean) {
  return useQuery({
    queryKey: qk.warehouses.list({ picker: 'stock-transfer', school }),
    queryFn: () =>
      warehousesApi
        .list({ is_active: true, page_size: 500, school: school || undefined })
        .then((r) => (r.data.results ?? r.data) as Warehouse[]),
    enabled: open && school > 0,
  })
}

function useSchoolItems(school: number, open: boolean) {
  return useQuery({
    queryKey: qk.items.list({ picker: 'stock-transfer', school }),
    queryFn: () =>
      itemsApi
        .list({ is_active: true, page_size: 500, school: school || undefined })
        .then((r) => (r.data.results ?? r.data) as Item[]),
    enabled: open && school > 0,
  })
}

function StockTransferForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const schools = useAuthStore((s) => s.accessibleSchools)

  const {
    control,
    register,
    watch,
    setValue,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<StockValues>({
    resolver: zodResolver(stockSchema),
    defaultValues: {
      from_school: 0, from_warehouse: 0, from_item: 0,
      to_school: 0, to_warehouse: 0, to_item: 0,
      quantity: 0, date: TODAY(), note: '',
    },
  })

  const fromSchool = Number(watch('from_school')) || 0
  const toSchool = Number(watch('to_school')) || 0

  const { data: fromWarehouses } = useSchoolWarehouses(fromSchool, open)
  const { data: fromItems } = useSchoolItems(fromSchool, open)
  const { data: toWarehouses } = useSchoolWarehouses(toSchool, open)
  const { data: toItems } = useSchoolItems(toSchool, open)

  // Reset dependent pickers when their school changes.
  useEffect(() => {
    setValue('from_warehouse', 0)
    setValue('from_item', 0)
  }, [fromSchool, setValue])
  useEffect(() => {
    setValue('to_warehouse', 0)
    setValue('to_item', 0)
  }, [toSchool, setValue])

  const whOptions = (rows?: Warehouse[]) => (rows ?? []).map((w) => ({ value: w.id, label: `${w.code} · ${w.name}` }))
  const itemOptions = (rows?: Item[]) => (rows ?? []).map((i) => ({ value: i.id, label: `${i.code} · ${i.name}`, description: i.uom }))

  const differentSchools = fromSchool > 0 && toSchool > 0 && fromSchool !== toSchool
  const quantity = Number(watch('quantity')) || 0
  const canSubmit =
    differentSchools &&
    Number(watch('from_warehouse')) > 0 && Number(watch('from_item')) > 0 &&
    Number(watch('to_warehouse')) > 0 && Number(watch('to_item')) > 0 &&
    quantity > 0

  const mutation = useMutation({
    mutationFn: (values: StockValues) =>
      transfersApi.stock({
        from_warehouse: values.from_warehouse,
        from_item: values.from_item,
        to_warehouse: values.to_warehouse,
        to_item: values.to_item,
        quantity: values.quantity.toFixed(2),
        date: values.date,
        note: values.note,
      }),
    onSuccess: (r) => {
      const t = r.data as Transfer
      showToast.success(`Stock transfer ${t.number} completed`)
      queryClient.invalidateQueries({ queryKey: qk.transfers.all })
      queryClient.invalidateQueries({ queryKey: qk.items.all })
      queryClient.invalidateQueries({ queryKey: qk.stockLevels.all })
      queryClient.invalidateQueries({ queryKey: qk.stockMoves.all })
      queryClient.invalidateQueries({ queryKey: qk.journals.all })
      queryClient.invalidateQueries({ queryKey: qk.reports.all })
      reset()
      onClose()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to transfer stock')),
  })

  return (
    <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
      <FormRow>
        <Controller
          control={control}
          name="from_school"
          render={({ field }) => (
            <Select
              label="From school"
              value={String(field.value || '')}
              onChange={(e) => field.onChange(Number(e.target.value) || 0)}
              error={errors.from_school?.message}
              required
            >
              <option value="">Select school…</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          )}
        />
        <Controller
          control={control}
          name="to_school"
          render={({ field }) => (
            <Select
              label="To school"
              value={String(field.value || '')}
              onChange={(e) => field.onChange(Number(e.target.value) || 0)}
              error={errors.to_school?.message}
              required
            >
              <option value="">Select school…</option>
              {schools.filter((s) => s.id !== fromSchool).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          )}
        />
      </FormRow>

      <FormRow>
        <Controller
          control={control}
          name="from_warehouse"
          render={({ field }) => (
            <AsyncSelect
              label="From warehouse"
              placeholder={fromSchool ? 'Search warehouse…' : 'Pick a school first'}
              value={field.value || null}
              onChange={(v) => field.onChange(Number(v) || 0)}
              options={whOptions(fromWarehouses)}
              searchable
              disabled={!fromSchool}
              error={errors.from_warehouse?.message}
              emptyMessage="No warehouses"
              required
            />
          )}
        />
        <Controller
          control={control}
          name="from_item"
          render={({ field }) => (
            <AsyncSelect
              label="From item"
              placeholder={fromSchool ? 'Search item…' : 'Pick a school first'}
              value={field.value || null}
              onChange={(v) => field.onChange(Number(v) || 0)}
              options={itemOptions(fromItems)}
              searchable
              disabled={!fromSchool}
              error={errors.from_item?.message}
              emptyMessage="No items"
              required
            />
          )}
        />
      </FormRow>

      <FormRow>
        <Controller
          control={control}
          name="to_warehouse"
          render={({ field }) => (
            <AsyncSelect
              label="To warehouse"
              placeholder={toSchool ? 'Search warehouse…' : 'Pick a school first'}
              value={field.value || null}
              onChange={(v) => field.onChange(Number(v) || 0)}
              options={whOptions(toWarehouses)}
              searchable
              disabled={!toSchool}
              error={errors.to_warehouse?.message}
              emptyMessage="No warehouses"
              required
            />
          )}
        />
        <Controller
          control={control}
          name="to_item"
          render={({ field }) => (
            <AsyncSelect
              label="To item"
              placeholder={toSchool ? 'Search item…' : 'Pick a school first'}
              value={field.value || null}
              onChange={(v) => field.onChange(Number(v) || 0)}
              options={itemOptions(toItems)}
              searchable
              disabled={!toSchool}
              error={errors.to_item?.message}
              emptyMessage="No items"
              required
            />
          )}
        />
      </FormRow>

      <FormRow>
        <Input type="number" step="0.01" min="0" label="Quantity" error={errors.quantity?.message} {...register('quantity')} />
        <Input type="date" label="Date" error={errors.date?.message} {...register('date')} />
      </FormRow>

      <Textarea label="Note (optional)" rows={2} error={errors.note?.message} {...register('note')} />

      <p className="flex items-start gap-2 text-xs text-gray-500 dark:text-slate-400">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          Ships stock out of the source school's warehouse and receives it into the destination
          school's warehouse at moving-average cost, settling the value between the two schools. The
          item and warehouse on each side must belong to that side's school.
        </span>
      </p>

      <ModalFooter>
        <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" loading={isSubmitting || mutation.isPending} disabled={!canSubmit}>
          Transfer stock
        </Button>
      </ModalFooter>
    </form>
  )
}
