import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { authApi } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'

type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

/**
 * Guards /app/* routes. On mount it bootstraps the session via
 * GET core/auth/me — if the cookie session is valid the user is stored,
 * otherwise the visitor is redirected to /login.
 */
export default function PrivateRoute({ children }: { children: ReactNode }) {
  const { setUser, logout } = useAuthStore()
  const [status, setStatus] = useState<AuthStatus>('loading')

  useEffect(() => {
    let cancelled = false

    authApi
      .me()
      .then((res) => {
        if (cancelled) return
        setUser(res.data?.user ?? res.data)
        setStatus('authenticated')
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (status === 'anonymous') {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
