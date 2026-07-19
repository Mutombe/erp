import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { guardiansApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { useOptimisticCreate, useOptimisticUpdate } from '@/hooks/useOptimisticMutation'
import { Button, FormRow, Input, Modal, ModalFooter } from '@/components/ui'
import type { Guardian } from '@/types/students'

const schema = z.object({
  code: z.string().default(''),
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  phone: z.string().default(''),
  email: z.string().email('Invalid email').or(z.literal('')).default(''),
  address: z.string().default(''),
  national_id: z.string().default(''),
  employer: z.string().default(''),
})

type FormValues = z.infer<typeof schema>

const EMPTY: FormValues = {
  code: '', first_name: '', last_name: '', phone: '', email: '',
  address: '', national_id: '', employer: '',
}

function toPayload(values: FormValues) {
  return {
    ...(values.code ? { code: values.code } : {}),
    first_name: values.first_name,
    last_name: values.last_name,
    phone: values.phone,
    email: values.email,
    address: values.address,
    national_id: values.national_id,
    employer: values.employer,
  }
}

export default function GuardianFormModal({
  open,
  onClose,
  guardian,
}: {
  open: boolean
  onClose: () => void
  guardian?: Guardian | null
}) {
  const isEdit = Boolean(guardian)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY })

  useEffect(() => {
    if (!open) return
    reset(
      guardian
        ? {
            code: guardian.code,
            first_name: guardian.first_name,
            last_name: guardian.last_name,
            phone: guardian.phone,
            email: guardian.email,
            address: guardian.address,
            national_id: guardian.national_id,
            employer: guardian.employer,
          }
        : EMPTY
    )
  }, [open, guardian, reset])

  const closeModal = () => {
    reset(EMPTY)
    onClose()
  }

  const createMutation = useOptimisticCreate<Guardian, FormValues>({
    mutationFn: (values) => guardiansApi.create(toPayload(values)),
    queryKeyPrefixes: [qk.guardians.all],
    createPlaceholder: (values) => ({
      id: -Date.now(),
      code: values.code || '…',
      first_name: values.first_name,
      last_name: values.last_name,
      full_name: `${values.first_name} ${values.last_name}`,
      phone: values.phone,
      email: values.email,
      address: values.address,
      national_id: values.national_id,
      employer: values.employer,
      students: [],
    }),
    successMessage: 'Guardian created',
    errorMessage: 'Failed to create guardian',
    closeModal,
  })

  const updateMutation = useOptimisticUpdate<Guardian, FormValues & { id: number }>({
    mutationFn: ({ id, ...values }) => guardiansApi.update(id, toPayload(values as FormValues)),
    queryKeyPrefixes: [qk.guardians.all],
    successMessage: 'Guardian updated',
    errorMessage: 'Failed to update guardian',
    closeModal,
  })

  const isPending = createMutation.isPending || updateMutation.isPending

  const onSubmit = (values: FormValues) => {
    if (guardian) {
      updateMutation.mutate({
        ...values,
        id: guardian.id,
        full_name: `${values.first_name} ${values.last_name}`,
      } as FormValues & { id: number })
    } else {
      createMutation.mutate(values)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Edit ${guardian?.full_name}` : 'New Guardian'} size="2xl">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormRow>
          <Input label="First name" error={errors.first_name?.message} {...register('first_name')} />
          <Input label="Last name" error={errors.last_name?.message} {...register('last_name')} />
        </FormRow>
        <FormRow>
          <Input
            label="Code"
            placeholder="Leave blank to auto-generate"
            error={errors.code?.message}
            {...register('code')}
          />
          <Input label="National ID" error={errors.national_id?.message} {...register('national_id')} />
        </FormRow>
        <FormRow>
          <Input label="Phone" error={errors.phone?.message} {...register('phone')} />
          <Input label="Email" error={errors.email?.message} {...register('email')} />
        </FormRow>
        <FormRow>
          <Input label="Address" error={errors.address?.message} {...register('address')} />
          <Input label="Employer" error={errors.employer?.message} {...register('employer')} />
        </FormRow>
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={isSubmitting || isPending}>
            {isEdit ? 'Save Changes' : 'Create Guardian'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
