import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface User {
  id: number
  email: string
  full_name: string
  first_name?: string
  last_name?: string
  phone?: string
  role: string
  is_active?: boolean
  home_school?: number | null
  is_hq?: boolean
  extra_schools?: number[]
}

/** Portal (family-facing) roles — routed to /portal instead of the back office. */
export const PORTAL_ROLES = ['guardian_portal', 'student_portal'] as const

/** True when a user's role belongs to the guardian/student portal audience. */
export function isPortalRole(role: string | null | undefined): boolean {
  return !!role && (PORTAL_ROLES as readonly string[]).includes(role)
}

/** Lightweight school card shared by the picker, login response and switcher. */
export interface SchoolSummary {
  id: number
  code: string
  name: string
  slug?: string
  logo: string | null
}

/** Effective permission matrix: `permissions[module][action] === true` when allowed. */
export type PermissionMatrix = Record<string, Record<string, boolean>>

/** The extended `me` payload returned by login / me / switch-school. */
export interface Me extends User {
  is_hq: boolean
  home_school: number | null
  accessible_schools: SchoolSummary[]
  active_school: SchoolSummary | null
  permissions: PermissionMatrix
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isHq: boolean
  /** The active school; null means "Golden Knot — all schools" (HQ). */
  activeSchool: SchoolSummary | null
  accessibleSchools: SchoolSummary[]
  /** Effective {module: {action: bool}} matrix for the active school. */
  permissions: PermissionMatrix
  /** Populate the whole session from a `me`-shaped payload. */
  setSession: (me: Me) => void
  setActiveSchool: (school: SchoolSummary | null) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isHq: false,
      activeSchool: null,
      accessibleSchools: [],
      permissions: {},
      setSession: (me) =>
        set({
          user: me,
          isAuthenticated: !!me,
          isHq: !!me?.is_hq,
          activeSchool: me?.active_school ?? null,
          accessibleSchools: me?.accessible_schools ?? [],
          permissions: me?.permissions ?? {},
        }),
      setActiveSchool: (school) => set({ activeSchool: school }),
      logout: () =>
        set({
          user: null,
          isAuthenticated: false,
          isHq: false,
          activeSchool: null,
          accessibleSchools: [],
          permissions: {},
        }),
    }),
    {
      name: 'auth-storage',
    }
  )
)
