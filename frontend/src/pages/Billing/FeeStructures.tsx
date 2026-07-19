import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { LayoutGrid, Plus, Trash2 } from 'lucide-react'
import { feeCategoriesApi, feeStructuresApi, gradesApi, termsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { showToast, parseApiError } from '@/lib/toast'
import {
  Button,
  ConfirmDialog,
  DataTable,
  FormRow,
  Input,
  Modal,
  ModalFooter,
  PageHeader,
  Select,
  type Column,
} from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import type { Grade, Term } from '@/types/students'
import { APPLIES_TO_OPTIONS, fmtMoney, type FeeCategory, type FeeStructure } from '@/types/fees'

const APPLIES_LABEL: Record<string, string> = Object.fromEntries(APPLIES_TO_OPTIONS.map(([v, l]) => [v, l]))

export default function FeeStructures() {
  const queryClient = useQueryClient()
  const [term, setTerm] = useState('')
  const [grade, setGrade] = useState('')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [toDelete, setToDelete] = useState<FeeStructure | null>(null)

  const { data: terms } = useQuery({
    queryKey: qk.terms.list(),
    queryFn: () => termsApi.list().then((r) => r.data as Term[]),
  })
  const { data: grades } = useQuery({
    queryKey: qk.grades.list(),
    queryFn: () => gradesApi.list().then((r) => r.data as Grade[]),
  })

  const { data, isLoading } = useQuery({
    queryKey: qk.feeStructures.list({ term, grade, page }),
    queryFn: () =>
      feeStructuresApi
        .list({ term: term || undefined, grade: grade || undefined, page })
        .then((r) => r.data as Paginated<FeeStructure>),
    placeholderData: keepPreviousData,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => feeStructuresApi.delete(id),
    onSuccess: () => {
      showToast.success('Fee structure deleted')
      queryClient.invalidateQueries({ queryKey: qk.feeStructures.all })
      setToDelete(null)
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to delete fee structure')),
  })

  const columns: Column<FeeStructure>[] = [
    { key: 'grade_name', header: 'Grade', render: (f) => <span className="font-medium">{f.grade_name}</span> },
    { key: 'term_name', header: 'Term' },
    { key: 'fee_category_code', header: 'Category', render: (f) => <span className="font-mono">{f.fee_category_code}</span> },
    { key: 'applies_to', header: 'Applies to', render: (f) => APPLIES_LABEL[f.applies_to] ?? f.applies_to },
    { key: 'currency', header: 'Ccy' },
    { key: 'amount', header: 'Amount', align: 'right', render: (f) => <span className="tabular-nums">{fmtMoney(f.amount)}</span> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (f) => (
        <button
          onClick={(e) => { e.stopPropagation(); setToDelete(f) }}
          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          title="Delete fee structure"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fee Structures"
        description="What each grade is charged per term, category and currency"
        icon={LayoutGrid}
        actions={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-2" /> New Fee Structure
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl">
        <Select label="Term" value={term} onChange={(e) => { setTerm(e.target.value); setPage(1) }}>
          <option value="">All terms</option>
          {(terms ?? []).map((t) => (
            <option key={t.id} value={String(t.id)}>{t.name}</option>
          ))}
        </Select>
        <Select label="Grade" value={grade} onChange={(e) => { setGrade(e.target.value); setPage(1) }}>
          <option value="">All grades</option>
          {(grades ?? []).map((g) => (
            <option key={g.id} value={String(g.id)}>{g.name}</option>
          ))}
        </Select>
      </div>

      <DataTable<FeeStructure>
        rowKey={(f) => f.id}
        columns={columns}
        data={data?.results ?? []}
        loading={isLoading}
        emptyTitle="No fee structures"
        emptyDescription="No fee structures match the selected filters."
        pagination={{ page, pageSize: 25, total: data?.count ?? 0, onPageChange: setPage }}
      />

      <FeeStructureFormModal open={showCreate} onClose={() => setShowCreate(false)} terms={terms ?? []} grades={grades ?? []} />

      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && deleteMutation.mutate(toDelete.id)}
        title="Delete fee structure?"
        message={
          toDelete
            ? `${toDelete.grade_name} · ${toDelete.term_name} · ${toDelete.fee_category_code} (${toDelete.currency} ${fmtMoney(toDelete.amount)}) will be removed. Existing invoices are not affected.`
            : ''
        }
        confirmText="Delete"
        variant="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  )
}

const structureSchema = z.object({
  term: z.coerce.number().min(1, 'Term is required'),
  grade: z.coerce.number().min(1, 'Grade is required'),
  fee_category: z.coerce.number().min(1, 'Fee category is required'),
  amount: z.coerce.number().positive('Amount must be positive'),
  currency: z.enum(['USD', 'ZWG']),
  applies_to: z.enum(['all', 'day', 'boarder']),
})

type StructureFormValues = z.infer<typeof structureSchema>

function FeeStructureFormModal({
  open,
  onClose,
  terms,
  grades,
}: {
  open: boolean
  onClose: () => void
  terms: Term[]
  grades: Grade[]
}) {
  const queryClient = useQueryClient()

  const { data: categories } = useQuery({
    queryKey: qk.feeCategories.list({ active: true }),
    queryFn: () => feeCategoriesApi.list({ is_active: true }).then((r) => r.data as FeeCategory[]),
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<StructureFormValues>({
    resolver: zodResolver(structureSchema),
    defaultValues: { currency: 'USD', applies_to: 'all' },
  })

  const mutation = useMutation({
    mutationFn: (values: StructureFormValues) => {
      const term = terms.find((t) => t.id === values.term)
      return feeStructuresApi.create({
        academic_year: term?.academic_year,
        term: values.term,
        grade: values.grade,
        fee_category: values.fee_category,
        amount: values.amount.toFixed(2),
        currency: values.currency,
        applies_to: values.applies_to,
      })
    },
    onSuccess: () => {
      showToast.success('Fee structure created')
      queryClient.invalidateQueries({ queryKey: qk.feeStructures.all })
      reset()
      onClose()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to create fee structure')),
  })

  return (
    <Modal open={open} onClose={onClose} title="New Fee Structure" size="2xl">
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
        <FormRow>
          <Select label="Term" error={errors.term?.message} {...register('term')}>
            <option value="">Select term…</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
          <Select label="Grade" error={errors.grade?.message} {...register('grade')}>
            <option value="">Select grade…</option>
            {grades.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </Select>
        </FormRow>
        <FormRow>
          <Select label="Fee category" error={errors.fee_category?.message} {...register('fee_category')}>
            <option value="">Select category…</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.code} · {c.name}</option>
            ))}
          </Select>
          <Select label="Applies to" error={errors.applies_to?.message} {...register('applies_to')}>
            {APPLIES_TO_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </FormRow>
        <FormRow>
          <Input
            type="number"
            step="0.01"
            min="0"
            label="Amount"
            error={errors.amount?.message}
            {...register('amount')}
          />
          <Select label="Currency" error={errors.currency?.message} {...register('currency')}>
            <option value="USD">USD</option>
            <option value="ZWG">ZWG</option>
          </Select>
        </FormRow>
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={isSubmitting || mutation.isPending}>Create Fee Structure</Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
