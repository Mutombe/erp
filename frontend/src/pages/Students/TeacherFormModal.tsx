import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { teachersApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { useOptimisticCreate, useOptimisticUpdate } from '@/hooks/useOptimisticMutation'
import { Button, FormRow, Input, Modal, ModalFooter, Select } from '@/components/ui'
import { TEACHER_STATUSES, type Teacher } from '@/types/students'

const schema = z.object({
  code: z.string().default(''),
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  email: z.string().email('Enter a valid email').or(z.literal('')).default(''),
  phone: z.string().default(''),
  national_id: z.string().default(''),
  gender: z.string().default(''),
  dob: z.string().default(''),
  hire_date: z.string().default(''),
  qualification: z.string().default(''),
  status: z.string().min(1, 'Status is required'),
})

type FormValues = z.infer<typeof schema>

function toPayload(values: FormValues) {
  return {
    first_name: values.first_name,
    last_name: values.last_name,
    email: values.email,
    phone: values.phone,
    national_id: values.national_id,
    gender: values.gender,
    dob: values.dob || null,
    hire_date: values.hire_date || null,
    qualification: values.qualification,
    status: values.status,
  }
}

export default function TeacherFormModal({
  open,
  teacher,
  onClose,
}: {
  open: boolean
  teacher?: Teacher | null
  onClose: () => void
}) {
  const isEdit = !!teacher
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: {
      code: teacher?.code ?? '',
      first_name: teacher?.first_name ?? '',
      last_name: teacher?.last_name ?? '',
      email: teacher?.email ?? '',
      phone: teacher?.phone ?? '',
      national_id: teacher?.national_id ?? '',
      gender: teacher?.gender ?? '',
      dob: teacher?.dob ?? '',
      hire_date: teacher?.hire_date ?? '',
      qualification: teacher?.qualification ?? '',
      status: teacher?.status ?? 'active',
    },
  })

  const close = () => {
    reset()
    onClose()
  }

  const createMutation = useOptimisticCreate<Teacher, FormValues>({
    mutationFn: (values) =>
      teachersApi.create({ ...(values.code ? { code: values.code } : {}), ...toPayload(values) }),
    queryKeyPrefixes: [qk.teachers.all],
    createPlaceholder: (values) => ({
      id: -Date.now(),
      code: values.code || '…',
      first_name: values.first_name,
      last_name: values.last_name,
      full_name: `${values.first_name} ${values.last_name}`,
      email: values.email,
      phone: values.phone,
      status: values.status as Teacher['status'],
      class_count: 0,
      student_count: 0,
      classes: [],
      subjects: [],
    }),
    successMessage: 'Teacher created',
    errorMessage: 'Failed to create teacher',
    closeModal: close,
  })

  // Invalidating the `teachers` prefix on settle also refreshes the detail
  // cache (qk.teachers.detail is prefix-matched), so the header updates too.
  const updateMutation = useOptimisticUpdate<Teacher, FormValues & { id: number }>({
    mutationFn: (values) => teachersApi.update(values.id, toPayload(values)),
    queryKeyPrefixes: [qk.teachers.all],
    successMessage: 'Teacher updated',
    errorMessage: 'Failed to update teacher',
    closeModal: close,
  })

  const onSubmit = (values: FormValues) => {
    if (isEdit && teacher) updateMutation.mutate({ ...values, id: teacher.id })
    else createMutation.mutate(values)
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Teacher' : 'New Teacher'} size="2xl">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormRow>
          <Input label="First name" error={errors.first_name?.message} {...register('first_name')} />
          <Input label="Last name" error={errors.last_name?.message} {...register('last_name')} />
        </FormRow>
        <FormRow>
          <Input
            label="Staff code"
            placeholder="Leave blank to auto-generate"
            disabled={isEdit}
            error={errors.code?.message}
            {...register('code')}
          />
          <Select label="Status" error={errors.status?.message} defaultValue={teacher?.status ?? 'active'} {...register('status')}>
            {TEACHER_STATUSES.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </FormRow>
        <FormRow>
          <Input label="Email" type="email" error={errors.email?.message} {...register('email')} />
          <Input label="Phone" error={errors.phone?.message} {...register('phone')} />
        </FormRow>
        <FormRow>
          <Select label="Gender" defaultValue={teacher?.gender ?? ''} {...register('gender')}>
            <option value="">Not specified</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </Select>
          <Input label="National ID" error={errors.national_id?.message} {...register('national_id')} />
        </FormRow>
        <FormRow>
          <Input type="date" label="Date of birth" error={errors.dob?.message} {...register('dob')} />
          <Input type="date" label="Hire date" error={errors.hire_date?.message} {...register('hire_date')} />
        </FormRow>
        <Input label="Qualification" placeholder="e.g. BSc Education" error={errors.qualification?.message} {...register('qualification')} />
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={isSubmitting || createMutation.isPending || updateMutation.isPending}>
            {isEdit ? 'Save Changes' : 'Create Teacher'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
