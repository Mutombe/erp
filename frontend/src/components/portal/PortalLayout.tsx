import { Suspense, useEffect, useRef } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { House, HandCoins, Moon, SignOut, Sun } from '@phosphor-icons/react'
import SchoolAvatar from '@/components/SchoolAvatar'
import { usePortalContext } from '@/hooks/usePortalContext'
import { authApi } from '@/services/api'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import type { Icon } from '@phosphor-icons/react'

interface PortalNavItem {
  label: string
  to: string
  icon: Icon
  end?: boolean
}

const NAV_ITEMS: PortalNavItem[] = [
  { label: 'Home', to: '/portal', icon: House, end: true },
  { label: 'Payments', to: '/portal/payments', icon: HandCoins },
]

/** Slim top-of-content bar shown while an inner route chunk is still loading. */
function RouteFallback() {
  return (
    <div className="relative h-1">
      <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-primary-100 dark:bg-primary-900/30">
        <div className="h-full w-1/3 bg-primary-500 animate-shimmer" />
      </div>
    </div>
  )
}

export default function PortalLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const { theme, toggleTheme } = useUIStore()
  const logoutStore = useAuthStore((s) => s.logout)
  const user = useAuthStore((s) => s.user)
  const { data: context } = usePortalContext()

  // Scoped scrolling: reset the content pane to the top on navigation.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [location.pathname])

  const handleLogout = async () => {
    try {
      await authApi.logout()
    } catch {
      // Even if the server call fails, clear the local session.
    }
    logoutStore()
    navigate('/login', { replace: true })
  }

  const school = context?.school
  const personName = context?.profile.name || user?.full_name || user?.email || 'Account'

  return (
    <div className="h-screen overflow-hidden bg-gray-50 dark:bg-slate-950">
      {/* Top bar — fixed row, never scrolls with the content */}
      <header className="shrink-0 h-16 flex items-center justify-between gap-3 px-4 sm:px-6 bg-white/85 backdrop-blur-xl border-b border-gray-200 dark:bg-slate-900/85 dark:border-slate-700">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-primary-600 text-white flex items-center justify-center shadow-sm shrink-0">
            <span className="font-black text-xs tracking-tighter">GK</span>
          </div>
          {school && (
            <span className="flex items-center gap-2 min-w-0">
              <SchoolAvatar school={school} className="w-7 h-7 text-[10px]" ocwFallbackCrest />
              <span className="min-w-0 hidden sm:block">
                <span className="block text-sm font-semibold text-gray-900 dark:text-slate-100 truncate leading-tight">
                  {school.name}
                </span>
                <span className="block text-[10px] uppercase tracking-wider text-gray-400 dark:text-slate-500 leading-tight">
                  Family portal
                </span>
              </span>
            </span>
          )}
        </div>

        <nav className="hidden sm:flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                )
              }
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <span className="hidden md:block text-sm font-medium text-gray-700 dark:text-slate-300 max-w-[10rem] truncate">
            {personName}
          </span>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <SignOut className="w-4 h-4" />
            <span className="hidden sm:inline">Log out</span>
          </button>
        </div>
      </header>

      {/* Mobile nav row */}
      <nav className="sm:hidden flex items-center gap-1 px-4 h-12 border-b border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-700">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                  : 'text-gray-600 dark:text-slate-400'
              )
            }
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Content — the only scoped scroll container. */}
      <main
        ref={mainRef}
        className="flex-1 h-[calc(100vh-7rem)] sm:h-[calc(100vh-4rem)] overflow-y-auto overscroll-contain"
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  )
}
