import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Minus, PencilSimple, Plus, ShieldCheck, UserCircle, X } from '@phosphor-icons/react'
import { permissionsApi, publicApi, usersApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { usePagedList } from '@/hooks/usePaginatedQuery'
import { useUrlFilters, filtersToQuery, type FilterConfig } from '@/hooks/useUrlFilters'
import { showToast, parseApiError } from '@/lib/toast'
import { useCan } from '@/hooks/useCan'
import { useAuthStore, type SchoolSummary } from '@/stores/authStore'
import { cn } from '@/lib/utils'
import {
  Accordion,
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  FilterBar,
  FormRow,
  Input,
  Modal,
  ModalFooter,
  RefreshingOverlay,
  Select,
  Skeleton,
  refreshingContentClass,
  type Column,
} from '@/components/ui'
import type { Paginated } from '@/types/accounting'

interface TeacherLink {
  id: number
  code: string
  name: string
  school: number
}

export interface UserRow {
  id: number
  email: string
  first_name: string
  last_name: string
  full_name: string
  phone: string
  role: string
  is_active: boolean
  home_school: number | null
  is_hq: boolean
  extra_schools: number[]
  teacher: TeacherLink | null
}

export const ROLES: [string, string][] = [
  ['admin', 'Administrator'],
  ['bursar', 'Bursar'],
  ['accounts_clerk', 'Accounts Clerk'],
  ['head', 'Head of School'],
  ['storekeeper', 'Storekeeper'],
  ['teacher', 'Teacher'],
  ['auditor_readonly', 'Auditor (read-only)'],
]

const roleLabel = (role: string) => ROLES.find(([value]) => value === role)?.[1] ?? role

const PAGE_SIZE = 25
const ROLE_OPTIONS = ROLES.map(([value, label]) => ({ value, label }))

// ---------------------------------------------------------------------------
// Onboarding form
// ---------------------------------------------------------------------------

const schema = z.object({
  email: z.string().email('A valid email is required'),
  first_name: z.string().default(''),
  last_name: z.string().default(''),
  phone: z.string().default(''),
  role: z.string().min(1, 'Role is required'),
  home_school: z.string().default(''),
  is_hq: z.boolean().default(false),
  is_active: z.boolean().default(true),
  password: z.string().default(''),
  teacher_first_name: z.string().default(''),
  teacher_last_name: z.string().default(''),
  teacher_email: z.string().default(''),
  teacher_phone: z.string().default(''),
})

type FormValues = z.infer<typeof schema>

function UserFormModal({
  user,
  schools,
  isHq,
  lockedSchoolId,
  onClose,
}: {
  user: UserRow | null
  schools: SchoolSummary[]
  isHq: boolean
  lockedSchoolId: number | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const isEdit = !!user

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: user?.email ?? '',
      first_name: user?.first_name ?? '',
      last_name: user?.last_name ?? '',
      phone: user?.phone ?? '',
      role: user?.role ?? 'accounts_clerk',
      home_school:
        user?.home_school != null
          ? String(user.home_school)
          : lockedSchoolId != null
            ? String(lockedSchoolId)
            : '',
      is_hq: user?.is_hq ?? false,
      is_active: user?.is_active ?? true,
      password: '',
      teacher_first_name: '',
      teacher_last_name: '',
      teacher_email: '',
      teacher_phone: '',
    },
  })

  const role = watch('role')
  const homeSchool = watch('home_school')
  const isHqUser = watch('is_hq')
  const [extraSchools, setExtraSchools] = useState<number[]>(user?.extra_schools ?? [])

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload: Record<string, unknown> = {
        email: values.email,
        first_name: values.first_name,
        last_name: values.last_name,
        phone: values.phone,
        role: values.role,
        is_active: values.is_active,
      }
      // Tenancy is HQ-controlled; scoped admins are pinned to their school.
      if (isHq) {
        payload.home_school = values.home_school ? Number(values.home_school) : null
        payload.is_hq = values.is_hq
        payload.extra_schools = values.is_hq ? [] : extraSchools
      } else if (lockedSchoolId != null) {
        payload.home_school = lockedSchoolId
      }
      if (values.password) payload.password = values.password
      // Teacher onboarding: create/link a Teacher only when there isn't one yet
      // (sending profile fields on an already-linked user would duplicate it).
      if (values.role === 'teacher' && !user?.teacher) {
        const tp: Record<string, unknown> = {}
        if (values.teacher_first_name) tp.first_name = values.teacher_first_name
        if (values.teacher_last_name) tp.last_name = values.teacher_last_name
        if (values.teacher_email) tp.email = values.teacher_email
        if (values.teacher_phone) tp.phone = values.teacher_phone
        payload.teacher_profile = tp
      }
      return user ? usersApi.update(user.id, payload) : usersApi.create(payload)
    },
    onSuccess: () => {
      showToast.success(user ? 'User updated' : 'User created')
      queryClient.invalidateQueries({ queryKey: qk.users.all })
      onClose()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to save user')),
  })

  const onSubmit = (values: FormValues) => {
    if (!isEdit && !values.password) {
      setError('password', { message: 'Password is required for a new user' })
      return
    }
    if (values.password && values.password.length < 8) {
      setError('password', { message: 'At least 8 characters' })
      return
    }
    mutation.mutate(values)
  }

  const toggleExtra = (id: number) =>
    setExtraSchools((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  return (
    <Modal
      open
      onClose={onClose}
      size="3xl"
      title={user ? `Edit ${user.email}` : 'New User'}
      icon={UserCircle}
      description="Onboard a staff member and assign their role. Permissions follow the role; fine-tune per-user access below."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Email"
          type="email"
          required
          error={errors.email?.message}
          {...register('email')}
        />
        <FormRow>
          <Input label="First name" {...register('first_name')} />
          <Input label="Last name" {...register('last_name')} />
        </FormRow>
        <FormRow>
          <Input label="Phone" {...register('phone')} />
          <Select
            label="Role"
            required
            value={role}
            onChange={(e) => setValue('role', e.target.value)}
            options={ROLES.map(([value, label]) => ({ value, label }))}
          />
        </FormRow>

        {/* Tenancy */}
        {isHq ? (
          <>
            <FormRow>
              <Select
                label="Home school"
                searchable
                placeholder="Select school…"
                disabled={isHqUser}
                value={homeSchool}
                onChange={(e) => setValue('home_school', e.target.value)}
                options={schools.map((s) => ({ value: String(s.id), label: `${s.code} · ${s.name}` }))}
                hint={isHqUser ? 'HQ users see every school.' : undefined}
              />
              <label className="flex flex-col justify-center gap-1.5">
                <span className="text-sm font-medium text-gray-700 dark:text-slate-300">HQ access</span>
                <span className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    checked={isHqUser}
                    onChange={(e) => setValue('is_hq', e.target.checked)}
                  />
                  Golden Knot HQ — sees all schools
                </span>
              </label>
            </FormRow>
            {!isHqUser && (
              <div>
                <span className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                  Extra schools <span className="text-gray-400 font-normal">(optional)</span>
                </span>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-40 overflow-y-auto rounded-xl border border-gray-200 dark:border-slate-700 p-3">
                  {schools
                    .filter((s) => String(s.id) !== homeSchool)
                    .map((s) => (
                      <label key={s.id} className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          checked={extraSchools.includes(s.id)}
                          onChange={() => toggleExtra(s.id)}
                        />
                        {s.code}
                      </label>
                    ))}
                </div>
              </div>
            )}
          </>
        ) : (
          lockedSchoolId != null && (
            <div className="text-sm text-gray-500 dark:text-slate-400">
              This user belongs to your school. HQ manages cross-school access.
            </div>
          )
        )}

        {/* Teacher onboarding */}
        {role === 'teacher' && (
          <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-4 space-y-3 bg-gray-50/50 dark:bg-slate-800/30">
            <p className="text-sm font-medium text-gray-700 dark:text-slate-300">Teacher profile</p>
            {user?.teacher ? (
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Linked to teacher <span className="font-mono">{user.teacher.code}</span> — {user.teacher.name}.
              </p>
            ) : (
              <>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  A Teacher record will be created and linked. Leave blank to reuse the name above.
                </p>
                <FormRow>
                  <Input label="First name" {...register('teacher_first_name')} />
                  <Input label="Last name" {...register('teacher_last_name')} />
                </FormRow>
                <FormRow>
                  <Input label="Email" {...register('teacher_email')} />
                  <Input label="Phone" {...register('teacher_phone')} />
                </FormRow>
              </>
            )}
          </div>
        )}

        {/* Status + password */}
        <FormRow>
          <label className="flex flex-col justify-center gap-1.5">
            <span className="text-sm font-medium text-gray-700 dark:text-slate-300">Status</span>
            <span className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                checked={watch('is_active')}
                onChange={(e) => setValue('is_active', e.target.checked)}
              />
              Active (can sign in)
            </span>
          </label>
          <Input
            label={user ? 'Reset password (leave blank to keep)' : 'Password'}
            type="password"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register('password')}
          />
        </FormRow>

        {/* Advanced per-user permission overrides (edit only — needs a user id) */}
        {user && (
          <Accordion
            title={
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary-600" /> Advanced permissions
              </span>
            }
            defaultOpen={false}
            className="dark:bg-slate-900 dark:border-slate-700"
          >
            <OverridesGrid userId={user.id} />
          </Accordion>
        )}

        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={mutation.isPending}>{user ? 'Save Changes' : 'Create User'}</Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Per-user overrides tri-state grid (Inherit / Allow / Deny)
// ---------------------------------------------------------------------------

type TriState = 'inherit' | 'allow' | 'deny'
type SchemaEntry = { value: string; label: string }

function OverridesGrid({ userId }: { userId: number }) {
  const queryClient = useQueryClient()

  const { data: schema } = useQuery({
    queryKey: qk.permissionSchema,
    queryFn: () => permissionsApi.schema().then((r) => r.data as { modules: SchemaEntry[]; actions: SchemaEntry[] }),
  })

  const { data: overrides, isSuccess } = useQuery({
    queryKey: qk.userOverrides(userId),
    queryFn: () =>
      permissionsApi.userOverrides(userId).then((r) => r.data.overrides as Record<string, Record<string, boolean>>),
  })

  const [state, setState] = useState<Record<string, Record<string, TriState>>>({})

  useEffect(() => {
    if (!isSuccess || !schema) return
    const next: Record<string, Record<string, TriState>> = {}
    for (const m of schema.modules) {
      next[m.value] = {}
      for (const a of schema.actions) {
        const ov = overrides?.[m.value]?.[a.value]
        next[m.value][a.value] = ov === true ? 'allow' : ov === false ? 'deny' : 'inherit'
      }
    }
    setState(next)
  }, [isSuccess, overrides, schema])

  const saveMutation = useMutation({
    mutationFn: () => {
      const body: Record<string, Record<string, boolean>> = {}
      for (const [m, actions] of Object.entries(state)) {
        for (const [a, tri] of Object.entries(actions)) {
          if (tri === 'inherit') continue
          body[m] = body[m] ?? {}
          body[m][a] = tri === 'allow'
        }
      }
      return permissionsApi.setUserOverrides(userId, body)
    },
    onSuccess: () => {
      showToast.success('Overrides saved')
      queryClient.invalidateQueries({ queryKey: qk.userOverrides(userId) })
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to save overrides')),
  })

  const cycle = (module: string, action: string) =>
    setState((prev) => {
      const cur = prev[module]?.[action] ?? 'inherit'
      const next: TriState = cur === 'inherit' ? 'allow' : cur === 'allow' ? 'deny' : 'inherit'
      return { ...prev, [module]: { ...prev[module], [action]: next } }
    })

  if (!schema) return <div className="p-4"><Skeleton className="h-40 w-full rounded-lg" /></div>

  const triStyles: Record<TriState, string> = {
    inherit: 'bg-gray-100 text-gray-400 dark:bg-slate-700 dark:text-slate-500',
    allow: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    deny: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  }
  const triIcon: Record<TriState, typeof Check> = { inherit: Minus, allow: Check, deny: X }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-gray-500 dark:text-slate-400">
          Overrides sit on top of the role. Click a cell to cycle Inherit → Allow → Deny.
        </p>
        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1"><Minus className="w-3 h-3" /> Inherit</span>
          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><Check className="w-3 h-3" /> Allow</span>
          <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400"><X className="w-3 h-3" /> Deny</span>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-slate-700">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 dark:bg-slate-800">
              <th className="sticky left-0 z-10 bg-gray-50 dark:bg-slate-800 px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-500 dark:text-slate-400">Module</th>
              {schema.actions.map((a) => (
                <th key={a.value} className="px-2 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 dark:text-slate-400">{a.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {schema.modules.map((m) => (
              <tr key={m.value} className="border-t border-gray-100 dark:border-slate-700/50">
                <td className="sticky left-0 z-10 bg-white dark:bg-slate-900 px-3 py-2 font-medium text-gray-800 dark:text-slate-200 whitespace-nowrap">{m.label}</td>
                {schema.actions.map((a) => {
                  const tri = state[m.value]?.[a.value] ?? 'inherit'
                  const Icon = triIcon[tri]
                  return (
                    <td key={a.value} className="px-2 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => cycle(m.value, a.value)}
                        className={cn('inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors', triStyles[tri])}
                        aria-label={`${m.label} — ${a.label}: ${tri}`}
                        title={tri}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <Button type="button" size="sm" loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          Save overrides
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export default function UsersTab() {
  const queryClient = useQueryClient()
  const isHq = useAuthStore((s) => s.isHq)
  const activeSchool = useAuthStore((s) => s.activeSchool)
  const canCreate = useCan('users', 'create')

  const { data: schools } = useQuery({
    queryKey: ['publicSchools'],
    queryFn: () => publicApi.schools().then((r) => r.data as SchoolSummary[]),
  })
  const schoolMap = useMemo(() => {
    const map = new Map<number, SchoolSummary>()
    ;(schools ?? []).forEach((s) => map.set(s.id, s))
    return map
  }, [schools])

  const filterConfig = useMemo<FilterConfig>(() => {
    const base: FilterConfig = [
      { type: 'search', placeholder: 'Search email or name…' },
      { type: 'chips', field: 'role', label: 'Role', options: ROLE_OPTIONS },
      { type: 'boolean', field: 'is_active', label: 'Active' },
    ]
    if (isHq) {
      base.push({
        type: 'select',
        field: 'home_school',
        label: 'School',
        searchable: true,
        placeholder: 'Any school',
        query: {
          queryKey: ['publicSchools'],
          queryFn: () => publicApi.schools().then((r) => r.data as unknown[]),
          toOption: (s: SchoolSummary) => ({ value: String(s.id), label: `${s.code} · ${s.name}` }),
        },
      })
    }
    return base
  }, [isHq])

  const filters = useUrlFilters(filterConfig)
  const [page, setPage] = useState(1)
  const [modalUser, setModalUser] = useState<UserRow | null | undefined>(undefined)
  const [toggleTarget, setToggleTarget] = useState<UserRow | null>(null)

  const filterSignature = JSON.stringify(filters.params)
  useEffect(() => {
    setPage(1)
  }, [filterSignature])

  const { data, results, total, isFetching } = usePagedList<UserRow>({
    keyFor: (p) => qk.users.list({ ...filters.params, page: p }),
    fetchPage: (p) =>
      usersApi.list(filtersToQuery(filters.params, { page: p })).then((r) => r.data as Paginated<UserRow>),
    page,
    pageSize: PAGE_SIZE,
  })
  const isRefreshing = isFetching && !!data

  const toggleMutation = useMutation({
    mutationFn: (user: UserRow) => usersApi.update(user.id, { is_active: !user.is_active }),
    onSuccess: (_, user) => {
      showToast.success(user.is_active ? 'User deactivated' : 'User reactivated')
      queryClient.invalidateQueries({ queryKey: qk.users.all })
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to update user')),
  })

  const renderSchools = (u: UserRow) => {
    if (u.is_hq) return <span className="text-gray-400">All schools</span>
    const names: string[] = []
    if (u.home_school != null) names.push(schoolMap.get(u.home_school)?.code ?? `#${u.home_school}`)
    ;(u.extra_schools ?? []).forEach((id) => names.push(schoolMap.get(id)?.code ?? `#${id}`))
    return names.length ? names.join(', ') : '—'
  }

  const columns: Column<UserRow>[] = [
    { key: 'email', header: 'Email', render: (u) => <span className="font-medium text-gray-900 dark:text-gray-100">{u.email}</span> },
    { key: 'full_name', header: 'Name' },
    { key: 'role', header: 'Role', render: (u) => <Badge variant="info">{roleLabel(u.role)}</Badge> },
    { key: 'schools', header: 'School(s)', render: renderSchools },
    { key: 'is_hq', header: 'HQ', render: (u) => (u.is_hq ? <Badge variant="warning">HQ</Badge> : <span className="text-gray-300">—</span>) },
    {
      key: 'is_active',
      header: 'Status',
      render: (u) => <Badge variant={u.is_active ? 'success' : 'danger'} dot>{u.is_active ? 'Active' : 'Disabled'}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (u) => (
        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="ghost" onClick={() => setModalUser(u)}>
            <PencilSimple className="w-3.5 h-3.5 mr-1.5" /> Edit
          </Button>
          <Button size="sm" variant={u.is_active ? 'outline' : 'success'} onClick={() => setToggleTarget(u)}>
            {u.is_active ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <FilterBar
        config={filterConfig}
        filters={filters}
        actions={
          canCreate ? (
            <Button onClick={() => setModalUser(null)}>
              <Plus className="w-4 h-4 mr-2" /> New User
            </Button>
          ) : undefined
        }
      />

      <div className="relative">
        <RefreshingOverlay active={isRefreshing} />
        <div className={refreshingContentClass(isRefreshing)}>
          <DataTable<UserRow>
            rowKey={(u) => u.id}
            columns={columns}
            data={results}
            loading={!data}
            emptyTitle="No users found"
            emptyDescription="No users match the current filters."
            pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
          />
        </div>
      </div>

      {modalUser !== undefined && (
        <UserFormModal
          user={modalUser}
          schools={schools ?? []}
          isHq={isHq}
          lockedSchoolId={isHq ? null : (activeSchool?.id ?? null)}
          onClose={() => setModalUser(undefined)}
        />
      )}

      <ConfirmDialog
        open={!!toggleTarget}
        onClose={() => setToggleTarget(null)}
        onConfirm={() => {
          if (toggleTarget) toggleMutation.mutate(toggleTarget)
          setToggleTarget(null)
        }}
        title={toggleTarget?.is_active ? `Deactivate ${toggleTarget?.email}?` : `Reactivate ${toggleTarget?.email ?? ''}?`}
        message={toggleTarget?.is_active
          ? 'The user will no longer be able to sign in. Their history and audit trail are preserved.'
          : 'The user will be able to sign in again with their existing credentials.'}
        confirmText={toggleTarget?.is_active ? 'Deactivate' : 'Reactivate'}
        variant={toggleTarget?.is_active ? 'danger' : 'info'}
      />
    </div>
  )
}
