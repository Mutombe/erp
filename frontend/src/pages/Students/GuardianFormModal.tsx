import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { guardiansApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { showToast, parseApiError } from '@/lib/toast'
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

export default function GuardianFormModal({
  open,
  onClose,
  guardian,
}: {
  open: boolean
  onClose: () => void
  guardian?: Guardian | null
}) {
  const queryClient = useQueryClient()
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

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        ...(values.code ? { code: values.code } : {}),
        first_name: values.first_name,
        last_name: values.last_name,
        phone: values.phone,
        email: values.email,
        address: values.address,
        national_id: values.national_id,
        employer: values.employer,
      }
      return guardian ? guardiansApi.update(guardian.id, payload) : guardiansApi.create(payload)
    },
    onSuccess: () => {
      showToast.success(isEdit ? 'Guardian updated' : 'Guardian created')
      queryClient.invalidateQueries({ queryKey: qk.guardians.all })
      reset(EMPTY)
      onClose()
    },
    onError: (error) =>
      showToast.error(parseApiError(error, isEdit ? 'Failed to update guardian' : 'Failed to create guardian')),
  })

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Edit ${guardian?.full_name}` : 'New Guardian'} size="2xl">
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
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
          <Button type="submit" loading={isSubmitting || mutation.isPending}>
            {isEdit ? 'Save Changes' : 'Create Guardian'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
