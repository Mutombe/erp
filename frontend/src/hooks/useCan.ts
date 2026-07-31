import type { ReactNode } from 'react'
import { useAuthStore } from '@/stores/authStore'

/**
 * The functional areas a permission can gate — mirrors the backend `Modules`.
 */
export type PermissionModule =
  | 'accounting'
  | 'fees'
  | 'students'
  | 'attendance'
  | 'inventory'
  | 'procurement'
  | 'assets'
  | 'ingestion'
  | 'reports'
  | 'settings'
  | 'users'

/** The verbs a permission can grant — mirrors the backend `Actions`. */
export type PermissionAction =
  | 'view'
  | 'create'
  | 'edit'
  | 'delete'
  | 'post'
  | 'approve'
  | 'export'

/**
 * `useCan('students', 'create')` → may the current user create students in the
 * active school? Reads the effective matrix already resolved by the backend
 * (`GET core/auth/me`), which folds role rows + per-user overrides and grants
 * superusers/admins everything — so the frontend just reads the boolean.
 *
 * Cheap: a single, stable Zustand selector; missing cells default to `false`.
 */
export function useCan(module: PermissionModule, action: PermissionAction): boolean {
  return useAuthStore((s) => s.permissions[module]?.[action] ?? false)
}

interface CanProps {
  module: PermissionModule
  action: PermissionAction
  children: ReactNode
  /** Rendered instead of `children` when the user lacks the permission. */
  fallback?: ReactNode
}

/**
 * Declarative gate: renders `children` only when the user may perform
 * `action` on `module`, else `fallback` (default: nothing).
 *
 *   <Can module="students" action="create"><Button>New Student</Button></Can>
 */
export function Can({ module, action, children, fallback = null }: CanProps): ReactNode {
  return useCan(module, action) ? children : fallback
}
