import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, Student } from '@phosphor-icons/react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { academicYearsApi, classesApi, gradesApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { usePagedList } from '@/hooks/usePaginatedQuery'
import { usePrefetchDetail } from '@/hooks/usePrefetch'
import { useUrlFilters, filtersToQuery, type FilterConfig } from '@/hooks/useUrlFilters'
import { useOptimisticCreate } from '@/hooks/useOptimisticMutation'
import { useCan } from '@/hooks/useCan'
import {
  Button,
  DataTable,
  FilterBar,
  FormRow,
  Input,
  Modal,
  ModalFooter,
  PageHeader,
  RefreshingOverlay,
  Select,
  refreshingContentClass,
  type Column,
} from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import type { AcademicYear, ClassRoom, Grade } from '@/types/students'

const PAGE_SIZE = 25

const FILTER_CONFIG: FilterConfig = [
  { type: 'search', placeholder: 'Search class or teacher…' },
  {
    type: 'select',
    field: 'grade',
    label: 'Grade',
    searchable: true,
    query: {
      queryKey: ['grades', 'facet-options'],
      queryFn: () => gradesApi.list({ page_size: 500 }).then((r) => (r.data.results ?? r.data) as any[]),
      toOption: (row) => ({ value: String(row.id), label: row.name }),
    },
  },
  {
    type: 'select',
    field: 'academic_year',
    label: 'Academic year',
    query: {
      queryKey: ['academicYears', 'facet-options'],
      queryFn: () => academicYearsApi.list({ page_size: 500 }).then((r) => (r.data.results ?? r.data) as any[]),
      toOption: (row) => ({ value: String(row.id), label: row.name }),
    },
  },
]

export default function Classes() {
  const navigate = useNavigate()
  const filters = useUrlFilters(FILTER_CONFIG)
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const canCreate = useCan('students', 'create')

  const filterSignature = JSON.stringify(filters.params)
  useEffect(() => {
    setPage(1)
  }, [filterSignature])

  const { data, results, total, isFetching } = usePagedList<ClassRoom>({
    keyFor: (p) => qk.classes.list({ ...filters.params, page: p }),
    fetchPage: (p) =>
      classesApi.list(filtersToQuery(filters.params, { page: p })).then((r) => r.data as Paginated<ClassRoom>),
    page,
    pageSize: PAGE_SIZE,
  })
  const isRefreshing = isFetching && !!data

  // Warm the class detail cache on row hover so opening a class is instant.
  const prefetchClass = usePrefetchDetail<ClassRoom>(
    (c) => qk.classes.detail(c.id),
    (c) => classesApi.get(c.id).then((r) => r.data)
  )

  const { data: years } = useQuery({
    queryKey: qk.academicYears.list(),
    queryFn: () => academicYearsApi.list().then((r) => r.data as AcademicYear[]),
  })
  const yearName = (id: number) => (years ?? []).find((y) => y.id === id)?.name ?? `#${id}`

  const columns: Column<ClassRoom>[] = [
    { key: 'name', header: 'Class', render: (c) => <span className="font-medium">{c.name}</span> },
    { key: 'grade_name', header: 'Grade' },
    { key: 'academic_year', header: 'Year', render: (c) => yearName(c.academic_year) },
    { key: 'teacher_name', header: 'Teacher', render: (c) => c.teacher_name || '—' },
    {
      key: 'student_count',
      header: 'Students',
      align: 'right',
      render: (c) => (
        <span className="tabular-nums">
          {c.student_count}{c.capacity ? ` / ${c.capacity}` : ''}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Classes"
        description="Classrooms per grade and academic year"
        icon={Student}
        actions={
          canCreate ? (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-2" /> New Class
            </Button>
          ) : undefined
        }
      />

      <FilterBar config={FILTER_CONFIG} filters={filters} />

      <div className="relative">
        <RefreshingOverlay active={isRefreshing} />
        <div className={refreshingContentClass(isRefreshing)}>
          <DataTable<ClassRoom>
            rowKey={(c) => c.id}
            columns={columns}
            data={results}
            loading={!data}
            onRowClick={(c) => navigate(`/app/classes/${c.id}`)}
            onRowHover={prefetchClass}
            emptyTitle="No classes found"
            emptyDescription="No classes match the current filters."
            pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
          />
        </div>
      </div>

      <ClassFormModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}

const classSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  grade: z.coerce.number().min(1, 'Grade is required'),
  academic_year: z.coerce.number().min(1, 'Academic year is required'),
  teacher_name: z.string().default(''),
  capacity: z.string().default(''),
})

type ClassFormValues = z.infer<typeof classSchema>

function ClassFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: grades } = useQuery({
    queryKey: qk.grades.list(),
    queryFn: () => gradesApi.list({ page_size: 500 }).then((r) => (r.data.results ?? r.data) as Grade[]),
  })
  const { data: years } = useQuery({
    queryKey: qk.academicYears.list(),
    queryFn: () => academicYearsApi.list().then((r) => r.data as AcademicYear[]),
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ClassFormValues>({ resolver: zodResolver(classSchema) })

  const mutation = useOptimisticCreate<ClassRoom, ClassFormValues>({
    mutationFn: (values) =>
      classesApi.create({
        name: values.name,
        grade: values.grade,
        academic_year: values.academic_year,
        teacher_name: values.teacher_name,
        ...(values.capacity ? { capacity: Number(values.capacity) } : {}),
      }),
    queryKeyPrefixes: [qk.classes.all],
    createPlaceholder: (values) => ({
      id: -Date.now(),
      name: values.name,
      grade: values.grade,
      grade_name: (grades ?? []).find((g) => g.id === values.grade)?.name ?? '…',
      academic_year: values.academic_year,
      teacher_name: values.teacher_name,
      capacity: values.capacity ? Number(values.capacity) : null,
      student_count: 0,
    }),
    successMessage: 'Class created',
    errorMessage: 'Failed to create class',
    closeModal: () => {
      reset()
      onClose()
    },
  })

  return (
    <Modal open={open} onClose={onClose} title="New Class">
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
        <FormRow>
          <Input label="Name" placeholder="e.g. Form 1 Blue" error={errors.name?.message} {...register('name')} />
          <Select label="Grade" error={errors.grade?.message} {...register('grade')}>
            <option value="">Select grade…</option>
            {(grades ?? []).map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </Select>
        </FormRow>
        <FormRow>
          <Select label="Academic year" error={errors.academic_year?.message} {...register('academic_year')}>
            <option value="">Select year…</option>
            {(years ?? []).map((y) => (
              <option key={y.id} value={y.id}>{y.name}</option>
            ))}
          </Select>
          <Input label="Teacher" error={errors.teacher_name?.message} {...register('teacher_name')} />
        </FormRow>
        <Input type="number" min="0" label="Capacity (optional)" error={errors.capacity?.message} {...register('capacity')} />
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={isSubmitting || mutation.isPending}>Create Class</Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
