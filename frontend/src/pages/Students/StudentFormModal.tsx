import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { studentsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { showToast, parseApiError } from '@/lib/toast'
import { Button, FormRow, Input, Modal, ModalFooter, Select } from '@/components/ui'
import { ATTENDANCE_TYPES, STUDENT_STATUSES } from '@/types/students'

const schema = z.object({
  code: z.string().default(''),
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  gender: z.string().default(''),
  dob: z.string().default(''),
  admission_date: z.string().default(''),
  status: z.string().min(1, 'Status is required'),
  attendance_type: z.string().min(1, 'Attendance type is required'),
})

type FormValues = z.infer<typeof schema>

export default function StudentFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { status: 'enrolled', attendance_type: 'day' },
  })

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      studentsApi.create({
        ...(values.code ? { code: values.code } : {}),
        first_name: values.first_name,
        last_name: values.last_name,
        gender: values.gender,
        dob: values.dob || null,
        admission_date: values.admission_date || null,
        status: values.status,
        attendance_type: values.attendance_type,
      }),
    onSuccess: (r) => {
      showToast.success(`Student ${r.data.code} created`)
      queryClient.invalidateQueries({ queryKey: qk.students.all })
      reset()
      onClose()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to create student')),
  })

  return (
    <Modal open={open} onClose={onClose} title="New Student" size="2xl">
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
        <FormRow>
          <Input label="First name" error={errors.first_name?.message} {...register('first_name')} />
          <Input label="Last name" error={errors.last_name?.message} {...register('last_name')} />
        </FormRow>
        <FormRow>
          <Input
            label="Admission code"
            placeholder="Leave blank to auto-generate"
            error={errors.code?.message}
            {...register('code')}
          />
          <Select label="Gender" {...register('gender')}>
            <option value="">Not specified</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </Select>
        </FormRow>
        <FormRow>
          <Input type="date" label="Date of birth" error={errors.dob?.message} {...register('dob')} />
          <Input
            type="date"
            label="Admission date"
            error={errors.admission_date?.message}
            {...register('admission_date')}
          />
        </FormRow>
        <FormRow>
          <Select label="Status" error={errors.status?.message} {...register('status')}>
            {STUDENT_STATUSES.map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </Select>
          <Select label="Attendance type" error={errors.attendance_type?.message} {...register('attendance_type')}>
            {ATTENDANCE_TYPES.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </FormRow>
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={isSubmitting || mutation.isPending}>Create Student</Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
