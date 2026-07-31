import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { authApi } from '@/services/api'
import { useAuthStore, isPortalRole, type Me } from '@/stores/authStore'

type AuthStatus = 'loading' | 'portal' | 'staff' | 'anonymous'

/**
 * Guards /portal/* routes. On mount it bootstraps the session via
 * GET core/auth/me — the same as PrivateRoute — but branches on role:
 *   - anonymous              → /login
 *   - authenticated portal   → render children (the family portal)
 *   - authenticated staff    → /app (they belong in the back office)
 */
export default function PortalRoute({ children }: { children: ReactNode }) {
  const { setSession, logout } = useAuthStore()
  const [status, setStatus] = useState<AuthStatus>('loading')

  useEffect(() => {
    let cancelled = false

    authApi
      .me()
      .then((res) => {
        if (cancelled) return
        const me = res.data as Me
        setSession(me)
        setStatus(isPortalRole(me.role) ? 'portal' : 'staff')
      })
      .catch(() => {
        if (cancelled) return
        logout()
        setStatus('anonymous')
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (status === 'anonymous') {
    return <Navigate to="/login" replace />
  }

  if (status === 'staff') {
    return <Navigate to="/app" replace />
  }

  return <>{children}</>
}
