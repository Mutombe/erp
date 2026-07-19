import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PencilSimple, Plus, UserCircle } from '@phosphor-icons/react'
import { usersApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { showToast, parseApiError } from '@/lib/toast'
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  FormRow,
  Input,
  Modal,
  ModalFooter,
  Select,
  type Column,
} from '@/components/ui'
import type { Paginated } from '@/types/accounting'

export interface UserRow {
  id: number
  email: string
  first_name: string
  last_name: string
  full_name: string
  phone: string
  role: string
  is_active: boolean
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

interface UserFormValues {
  email: string
  first_name: string
  last_name: string
  phone: string
  role: string
  password: string
}

function UserFormModal({ user, onClose }: { user: UserRow | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UserFormValues>({
    defaultValues: {
      email: user?.email ?? '',
      first_name: user?.first_name ?? '',
      last_name: user?.last_name ?? '',
      phone: user?.phone ?? '',
      role: user?.role ?? 'accounts_clerk',
      password: '',
    },
  })

  const mutation = useMutation({
    mutationFn: (values: UserFormValues) => {
      const payload: Record<string, unknown> = {
        email: values.email,
        first_name: values.first_name,
        last_name: values.last_name,
        phone: values.phone,
        role: values.role,
      }
      if (values.password) payload.password = values.password
      return user ? usersApi.update(user.id, payload) : usersApi.create(payload)
    },
    onSuccess: () => {
      showToast.success(user ? 'User updated' : 'User created')
      queryClient.invalidateQueries({ queryKey: qk.users.all })
      onClose()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to save user')),
  })

  return (
    <Modal open onClose={onClose} title={user ? `Edit ${user.email}` : 'New User'} icon={UserCircle}>
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
        <Input
          label="Email"
          type="email"
          required
          error={errors.email?.message}
          {...register('email', { required: 'Email is required' })}
        />
        <FormRow>
          <Input label="First name" {...register('first_name')} />
          <Input label="Last name" {...register('last_name')} />
        </FormRow>
        <FormRow>
          <Input label="Phone" {...register('phone')} />
          <Select label="Role" required {...register('role')} defaultValue={user?.role ?? 'accounts_clerk'}>
            {ROLES.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </FormRow>
        <Input
          label={user ? 'New password (leave blank to keep)' : 'Password'}
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password', user ? {} : { required: 'Password is required', minLength: { value: 8, message: 'At least 8 characters' } })}
        />
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={mutation.isPending}>{user ? 'Save Changes' : 'Create User'}</Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}

export default function UsersTab() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  // undefined = closed, null = create, UserRow = edit
  const [modalUser, setModalUser] = useState<UserRow | null | undefined>(undefined)
  const [toggleTarget, setToggleTarget] = useState<UserRow | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: qk.users.list({ page, search }),
    queryFn: () =>
      usersApi.list({ page, search: search || undefined }).then((r) => r.data as Paginated<UserRow>),
    placeholderData: keepPreviousData,
  })

  const toggleMutation = useMutation({
    mutationFn: (user: UserRow) => usersApi.update(user.id, { is_active: !user.is_active }),
    onSuccess: (_, user) => {
      showToast.success(user.is_active ? 'User deactivated' : 'User reactivated')
      queryClient.invalidateQueries({ queryKey: qk.users.all })
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to update user')),
  })

  const columns: Column<UserRow>[] = [
    { key: 'email', header: 'Email', render: (u) => <span className="font-medium text-gray-900 dark:text-gray-100">{u.email}</span> },
    { key: 'full_name', header: 'Name' },
    { key: 'phone', header: 'Phone', render: (u) => u.phone || '—' },
    { key: 'role', header: 'Role', render: (u) => <Badge variant="info">{roleLabel(u.role)}</Badge> },
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
      <DataTable<UserRow>
        rowKey={(u) => u.id}
        columns={columns}
        data={data?.results ?? []}
        loading={isLoading}
        searchable
        searchValue={search}
        onSearch={(q) => { setSearch(q); setPage(1) }}
        searchPlaceholder="Search email or name…"
        emptyTitle="No users found"
        actions={
          <Button onClick={() => setModalUser(null)}>
            <Plus className="w-4 h-4 mr-2" /> New User
          </Button>
        }
        pagination={{ page, pageSize: 25, total: data?.count ?? 0, onPageChange: setPage }}
      />

      {modalUser !== undefined && (
        <UserFormModal user={modalUser} onClose={() => setModalUser(undefined)} />
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
