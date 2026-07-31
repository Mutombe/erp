import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowCounterClockwise, FloppyDisk, ShieldCheck, Info } from '@phosphor-icons/react'
import { permissionsApi, publicApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { showToast, parseApiError } from '@/lib/toast'
import { useCan } from '@/hooks/useCan'
import { useAuthStore, type SchoolSummary } from '@/stores/authStore'
import { Badge, Button, EmptyState, Select, Skeleton } from '@/components/ui'
import { cn } from '@/lib/utils'

type SchemaEntry = { value: string; label: string }
type Schema = { modules: SchemaEntry[]; actions: SchemaEntry[] }
type Matrix = Record<string, Record<string, boolean>>

// Non-portal roles are the only ones the matrix governs (portal roles get
// nothing by design and are hidden here).
const EDITABLE_ROLES: [string, string][] = [
  ['admin', 'Administrator'],
  ['bursar', 'Bursar'],
  ['accounts_clerk', 'Accounts Clerk'],
  ['head', 'Head of School'],
  ['storekeeper', 'Storekeeper'],
  ['teacher', 'Teacher'],
  ['auditor_readonly', 'Auditor (read-only)'],
]

/** A compact on/off switch. */
function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean
  disabled?: boolean
  onChange: () => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 dark:focus:ring-offset-slate-900',
        checked ? 'bg-primary-600' : 'bg-gray-300 dark:bg-slate-600',
        disabled && 'opacity-40 cursor-not-allowed',
      )}
    >
      <span
        className={cn(
          'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[1.15rem]' : 'translate-x-[0.15rem]',
        )}
      />
    </button>
  )
}

function matricesEqual(a: Matrix, b: Matrix, modules: string[], actions: string[]) {
  for (const m of modules) for (const act of actions) {
    if (!!a[m]?.[act] !== !!b[m]?.[act]) return false
  }
  return true
}

export default function PermissionsTab() {
  const canEdit = useCan('users', 'edit')
  const queryClient = useQueryClient()
  const isHq = useAuthStore((s) => s.isHq)
  const activeSchool = useAuthStore((s) => s.activeSchool)

  const [schoolId, setSchoolId] = useState<number | null>(activeSchool?.id ?? null)
  const [role, setRole] = useState<string>('bursar')
  const [draft, setDraft] = useState<Matrix>({})

  // HQ picks a school; scoped admins are pinned to their active school.
  const { data: schools } = useQuery({
    queryKey: ['publicSchools'],
    queryFn: () => publicApi.schools().then((r) => r.data as SchoolSummary[]),
    enabled: isHq,
  })

  // For HQ, default the school once the list loads.
  useEffect(() => {
    if (isHq && schoolId == null && schools && schools.length > 0) {
      setSchoolId(schools[0].id)
    }
  }, [isHq, schoolId, schools])

  const { data: schema } = useQuery({
    queryKey: qk.permissionSchema,
    queryFn: () => permissionsApi.schema().then((r) => r.data as Schema),
  })

  const effectiveSchool = isHq ? schoolId : (activeSchool?.id ?? schoolId)

  const {
    data: serverMatrix,
    isFetching,
    isSuccess,
  } = useQuery({
    queryKey: qk.roleMatrix(effectiveSchool ?? 'none', role),
    queryFn: () =>
      permissionsApi.roleMatrix(effectiveSchool!, role).then((r) => r.data.permissions as Matrix),
    enabled: !!effectiveSchool && !!role && canEdit,
  })

  // Reset the local draft whenever a fresh server matrix arrives.
  useEffect(() => {
    if (isSuccess && serverMatrix) setDraft(serverMatrix)
  }, [isSuccess, serverMatrix, effectiveSchool, role])

  const modules = schema?.modules ?? []
  const actions = schema?.actions ?? []
  const moduleValues = useMemo(() => modules.map((m) => m.value), [modules])
  const actionValues = useMemo(() => actions.map((a) => a.value), [actions])

  const isAdminRole = role === 'admin'
  const readOnly = !canEdit || isAdminRole

  const dirty = useMemo(() => {
    if (!serverMatrix) return false
    return !matricesEqual(draft, serverMatrix, moduleValues, actionValues)
  }, [draft, serverMatrix, moduleValues, actionValues])

  const saveMutation = useMutation({
    mutationFn: () => permissionsApi.setRoleMatrix(effectiveSchool!, role, draft),
    onSuccess: () => {
      showToast.success('Permissions saved')
      queryClient.invalidateQueries({ queryKey: qk.roleMatrix(effectiveSchool ?? 'none', role) })
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to save permissions')),
  })

  const toggleCell = (module: string, action: string) => {
    if (readOnly) return
    setDraft((prev) => ({
      ...prev,
      [module]: { ...prev[module], [action]: !prev[module]?.[action] },
    }))
  }

  const setRow = (module: string, value: boolean) => {
    if (readOnly) return
    setDraft((prev) => {
      const row: Record<string, boolean> = { ...prev[module] }
      for (const a of actionValues) row[a] = value
      return { ...prev, [module]: row }
    })
  }

  if (!canEdit) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Permissions are admin-only"
        description="You don't have permission to manage the role permission matrix."
      />
    )
  }

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4">
        {isHq && (
          <div className="w-64">
            <Select
              label="School"
              placeholder="Select school…"
              searchable
              value={schoolId != null ? String(schoolId) : ''}
              onChange={(e) => setSchoolId(e.target.value ? Number(e.target.value) : null)}
              options={(schools ?? []).map((s) => ({ value: String(s.id), label: `${s.code} · ${s.name}` }))}
            />
          </div>
        )}
        {!isHq && activeSchool && (
          <div>
            <span className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">School</span>
            <Badge variant="info">{activeSchool.name}</Badge>
          </div>
        )}
        <div className="w-56">
          <Select
            label="Role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            options={EDITABLE_ROLES.map(([value, label]) => ({ value, label }))}
          />
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={!dirty || saveMutation.isPending}
            onClick={() => serverMatrix && setDraft(serverMatrix)}
          >
            <ArrowCounterClockwise className="w-4 h-4 mr-2" /> Reset
          </Button>
          <Button
            disabled={!dirty || readOnly}
            loading={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            <FloppyDisk className="w-4 h-4 mr-2" /> Save changes
          </Button>
        </div>
      </div>

      {/* Notes */}
      <div className="flex items-start gap-2 text-sm text-gray-500 dark:text-slate-400">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        {isAdminRole ? (
          <span>Administrators always have full access and cannot be restricted here.</span>
        ) : (
          <span>
            Toggle what the <span className="font-medium text-gray-700 dark:text-slate-300">{EDITABLE_ROLES.find(([v]) => v === role)?.[1]}</span> role
            may do in this school. Per-user exceptions live under each user's “Advanced permissions”.
          </span>
        )}
      </div>

      {/* Grid */}
      {!effectiveSchool ? (
        <EmptyState icon={ShieldCheck} title="Select a school" description="Choose a school to edit its role permissions." />
      ) : isFetching && !serverMatrix ? (
        <Skeleton className="h-80 w-full rounded-xl" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-slate-800">
                <th className="sticky left-0 z-10 bg-gray-50 dark:bg-slate-800 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 border-b border-gray-200 dark:border-slate-700">
                  Module
                </th>
                {actions.map((a) => (
                  <th
                    key={a.value}
                    className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 border-b border-gray-200 dark:border-slate-700"
                  >
                    {a.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modules.map((m) => {
                const row = draft[m.value] ?? {}
                const allOn = actionValues.every((a) => (isAdminRole ? true : row[a]))
                return (
                  <tr key={m.value} className="border-b border-gray-100 dark:border-slate-700/50 last:border-0 hover:bg-gray-50/60 dark:hover:bg-slate-800/40">
                    <td className="sticky left-0 z-10 bg-white dark:bg-slate-900 px-4 py-2.5 font-medium text-gray-800 dark:text-slate-200 whitespace-nowrap">
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => setRow(m.value, !allOn)}
                        className={cn(
                          'text-left',
                          !readOnly && 'hover:text-primary-600 dark:hover:text-primary-400',
                          readOnly && 'cursor-default',
                        )}
                        title={readOnly ? undefined : allOn ? 'Turn all off' : 'Turn all on'}
                      >
                        {m.label}
                      </button>
                    </td>
                    {actions.map((a) => {
                      const checked = isAdminRole ? true : !!row[a.value]
                      return (
                        <td key={a.value} className="px-3 py-2.5 text-center">
                          <div className="flex justify-center">
                            <Toggle
                              checked={checked}
                              disabled={readOnly}
                              onChange={() => toggleCell(m.value, a.value)}
                              label={`${m.label} — ${a.label}`}
                            />
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
