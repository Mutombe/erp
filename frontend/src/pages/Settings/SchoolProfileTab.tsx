import { useForm } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FloppyDisk } from '@phosphor-icons/react'
import { settingsApi, academicYearsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { showToast, parseApiError } from '@/lib/toast'
import { Button, FormRow, Input, Select, SkeletonForm, Textarea } from '@/components/ui'

interface SchoolSettingsData {
  school_name: string
  address: string
  phone: string
  email: string
  base_currency: string
  secondary_currency: string
  revenue_recognition: 'immediate' | 'deferred'
  current_academic_year: number | null
  default_due_days: number
  statement_footer: string
}

interface AcademicYearOption {
  id: number
  name: string
  is_current: boolean
}

interface ProfileForm {
  school_name: string
  address: string
  phone: string
  email: string
  secondary_currency: string
  revenue_recognition: string
  current_academic_year: string
  default_due_days: string
  statement_footer: string
}

export default function SchoolProfileTab() {
  const queryClient = useQueryClient()

  // Singleton endpoint: list() returns the settings object directly.
  const { data, isLoading } = useQuery({
    queryKey: qk.settings.list(),
    queryFn: () => settingsApi.list().then((r) => r.data as SchoolSettingsData),
  })

  const { data: years } = useQuery({
    queryKey: qk.academicYears.list(),
    queryFn: () => academicYearsApi.list().then((r) => r.data as AcademicYearOption[]),
  })

  if (isLoading || !data) return <SkeletonForm />

  return <ProfileForm settings={data} years={years ?? []} onSaved={() => {
    queryClient.invalidateQueries({ queryKey: qk.settings.all })
  }} />
}

function ProfileForm({
  settings,
  years,
  onSaved,
}: {
  settings: SchoolSettingsData
  years: AcademicYearOption[]
  onSaved: () => void
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileForm>({
    defaultValues: {
      school_name: settings.school_name,
      address: settings.address,
      phone: settings.phone,
      email: settings.email,
      secondary_currency: settings.secondary_currency,
      revenue_recognition: settings.revenue_recognition,
      current_academic_year: settings.current_academic_year ? String(settings.current_academic_year) : '',
      default_due_days: String(settings.default_due_days),
      statement_footer: settings.statement_footer,
    },
  })

  const mutation = useMutation({
    // Singleton settings update goes through POST (viewset create = partial update).
    mutationFn: (values: ProfileForm) =>
      settingsApi.create({
        school_name: values.school_name,
        address: values.address,
        phone: values.phone,
        email: values.email,
        secondary_currency: values.secondary_currency,
        revenue_recognition: values.revenue_recognition,
        current_academic_year: values.current_academic_year ? Number(values.current_academic_year) : null,
        default_due_days: Number(values.default_due_days) || 0,
        statement_footer: values.statement_footer,
      }),
    onSuccess: () => {
      showToast.success('School settings saved')
      onSaved()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to save settings')),
  })

  return (
    <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4 max-w-3xl">
      <FormRow>
        <Input
          label="School name"
          required
          error={errors.school_name?.message}
          {...register('school_name', { required: 'School name is required' })}
        />
        <Input label="Email" type="email" {...register('email')} />
      </FormRow>
      <FormRow>
        <Input label="Phone" {...register('phone')} />
        <Input
          label="Default due days"
          hint="Days until a posted invoice falls due"
          {...register('default_due_days', { pattern: { value: /^\d+$/, message: 'Whole number of days' } })}
          error={errors.default_due_days?.message}
        />
      </FormRow>
      <Textarea label="Address" rows={2} {...register('address')} />
      <FormRow>
        <Input label="Base currency" value={settings.base_currency} disabled
          hint="Fixed — the ledger is kept in base currency" />
        <Select label="Secondary currency" {...register('secondary_currency')} defaultValue={settings.secondary_currency}>
          <option value="ZWG">ZWG</option>
          <option value="USD">USD</option>
        </Select>
      </FormRow>
      <FormRow>
        <Select label="Revenue recognition" {...register('revenue_recognition')} defaultValue={settings.revenue_recognition}>
          <option value="immediate">Recognize at invoice</option>
          <option value="deferred">Defer until term recognition</option>
        </Select>
        <Select
          label="Current academic year"
          placeholder="Not set"
          {...register('current_academic_year')}
          defaultValue={settings.current_academic_year ? String(settings.current_academic_year) : ''}
          options={years.map((y) => ({ value: String(y.id), label: y.name }))}
        />
      </FormRow>
      <Textarea label="Statement footer" rows={3}
        placeholder="Shown at the bottom of student statements…" {...register('statement_footer')} />
      <div className="pt-2">
        <Button type="submit" loading={mutation.isPending}>
          <FloppyDisk className="w-4 h-4 mr-2" /> Save settings
        </Button>
      </div>
    </form>
  )
}
