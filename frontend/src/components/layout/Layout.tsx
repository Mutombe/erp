import { Suspense, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowsLeftRight,
  ChartBar,
  BookOpen,
  Buildings,
  CaretDown,
  CaretDoubleLeft,
  CaretDoubleRight,
  Coins,
  CreditCard,
  FileText,
  GitDiff,
  GraduationCap,
  Bank,
  SquaresFour,
  SignOut,
  List,
  Moon,
  NotePencil,
  Package,
  BoxArrowDown,
  PlayCircle,
  Receipt,
  Invoice,
  Student,
  Gear,
  ShoppingCart,
  Sun,
  Tray,
  Truck,
  Users,
  UsersFour,
  Wallet,
  Warehouse,
  X,
  type Icon,
} from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import CacheWarmer from '@/components/CacheWarmer'
import SchoolAvatar from '@/components/SchoolAvatar'
import { cn } from '@/lib/utils'
import { authApi } from '@/services/api'
import { useAuthStore, type SchoolSummary } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { showToast, parseApiError } from '@/lib/toast'
import { Check } from '@phosphor-icons/react'

interface NavItem {
  label: string
  to: string
  icon: Icon
  end?: boolean
}

interface NavSection {
  label: string
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', to: '/app', icon: SquaresFour, end: true },
      { label: 'Reports', to: '/app/reports', icon: ChartBar },
    ],
  },
  {
    label: 'Documents',
    items: [{ label: 'Inbox', to: '/app/ingestion', icon: Tray }],
  },
  {
    label: 'Students & Fees',
    items: [
      { label: 'Students', to: '/app/students', icon: GraduationCap },
      { label: 'Guardians', to: '/app/guardians', icon: Users },
      { label: 'Classes', to: '/app/classes', icon: Student },
      { label: 'Fee Structures', to: '/app/fee-structures', icon: Wallet },
      { label: 'Billing Runs', to: '/app/billing-runs', icon: PlayCircle },
      { label: 'Fee Invoices', to: '/app/fee-invoices', icon: FileText },
      { label: 'Receipts', to: '/app/receipts', icon: Receipt },
    ],
  },
  {
    label: 'Accounting',
    items: [
      { label: 'Chart of Accounts', to: '/app/chart-of-accounts', icon: BookOpen },
      { label: 'Journals', to: '/app/journals', icon: NotePencil },
      { label: 'Bank Accounts', to: '/app/bank-accounts', icon: Bank },
      { label: 'Reconciliation', to: '/app/bank-reconciliation', icon: GitDiff },
      { label: 'Pockets', to: '/app/pockets', icon: Coins },
      { label: 'Fixed Assets', to: '/app/fixed-assets', icon: Buildings },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { label: 'Items', to: '/app/items', icon: Package },
      { label: 'Warehouses', to: '/app/warehouses', icon: Warehouse },
      { label: 'Departments', to: '/app/departments', icon: UsersFour },
      { label: 'Stock Moves', to: '/app/stock-moves', icon: ArrowsLeftRight },
    ],
  },
  {
    label: 'Purchasing',
    items: [
      { label: 'Suppliers', to: '/app/suppliers', icon: Truck },
      { label: 'Purchase Orders', to: '/app/purchase-orders', icon: ShoppingCart },
      { label: 'GRNs', to: '/app/grns', icon: BoxArrowDown },
      { label: 'Vendor Bills', to: '/app/vendor-bills', icon: Invoice },
      { label: 'Supplier Payments', to: '/app/supplier-payments', icon: CreditCard },
    ],
  },
  {
    label: 'Settings',
    items: [{ label: 'Settings', to: '/app/settings', icon: Gear }],
  },
]

function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 overflow-y-auto sidebar-scroll px-3 py-4 space-y-6">
      {navSections.map((section) => (
        <div key={section.label}>
          {!collapsed && (
            <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">
              {section.label}
            </p>
          )}
          <div className="space-y-0.5">
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    collapsed && 'justify-center px-2',
                    isActive
                      ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                  )
                }
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  )
}

// Brand pseudo-school shown when an HQ user is viewing "all schools".
const ALL_SCHOOLS_BRAND: SchoolSummary = {
  id: 0,
  code: 'GK',
  name: 'Golden Knot',
  logo: null,
}

function SidebarBrand({ collapsed }: { collapsed: boolean }) {
  const activeSchool = useAuthStore((s) => s.activeSchool)
  const brand = activeSchool ?? ALL_SCHOOLS_BRAND
  const subtitle = activeSchool ? activeSchool.code : 'All schools'
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 h-16 border-b border-gray-200 dark:border-slate-700',
        collapsed ? 'justify-center px-2' : 'px-5'
      )}
    >
      <SchoolAvatar school={brand} className="w-9 h-9 text-xs" ocwFallbackCrest />
      {!collapsed && (
        <span className="min-w-0">
          <span className="block font-bold text-gray-900 dark:text-slate-100 truncate leading-tight">
            {brand.name}
          </span>
          <span className="block text-[10px] uppercase tracking-wider text-ocean-600 dark:text-ocean-400">
            {subtitle}
          </span>
        </span>
      )}
    </div>
  )
}

/** Header school switcher. HQ and multi-school users get a dropdown to change
 *  the active school (HQ also gets a "Golden Knot — All schools" option);
 *  single-school users just see their school name. */
function SchoolSwitcher() {
  const isHq = useAuthStore((s) => s.isHq)
  const activeSchool = useAuthStore((s) => s.activeSchool)
  const accessibleSchools = useAuthStore((s) => s.accessibleSchools)
  const setActiveSchool = useAuthStore((s) => s.setActiveSchool)
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const hasSwitcher = isHq || accessibleSchools.length > 1
  const current = activeSchool ?? ALL_SCHOOLS_BRAND
  const currentSubtitle = activeSchool ? activeSchool.code : 'All schools'

  const applySwitch = async (school: SchoolSummary | null) => {
    setOpen(false)
    // No-op if selecting the already-active scope.
    if ((school?.id ?? null) === (activeSchool?.id ?? null)) return
    setSwitching(true)
    try {
      const res = await authApi.switchSchool(school ? school.id : null)
      setActiveSchool((res.data.active_school as SchoolSummary | null) ?? null)
      // Re-scope every cached list/report to the new school.
      queryClient.clear()
    } catch (error) {
      showToast.error(parseApiError(error, 'Could not switch school.'))
    } finally {
      setSwitching(false)
    }
  }

  // Non-HQ single-school user: static label, no dropdown.
  if (!hasSwitcher) {
    return (
      <span className="flex items-center gap-2 min-w-0">
        <SchoolAvatar school={current} className="w-7 h-7 text-[10px]" ocwFallbackCrest />
        <span className="font-semibold text-gray-900 dark:text-slate-100 truncate max-w-[12rem]">
          {current.name}
        </span>
      </span>
    )
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        disabled={switching}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors max-w-[16rem] disabled:opacity-60"
      >
        <SchoolAvatar school={current} className="w-7 h-7 text-[10px]" ocwFallbackCrest />
        <span className="min-w-0 text-left hidden sm:block">
          <span className="block text-sm font-semibold text-gray-900 dark:text-slate-100 truncate leading-tight">
            {current.name}
          </span>
          <span className="block text-[10px] uppercase tracking-wider text-gray-400 dark:text-slate-500 leading-tight">
            {currentSubtitle}
          </span>
        </span>
        <CaretDown className="w-4 h-4 text-gray-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-64 rounded-xl border border-gray-200 bg-white shadow-lg z-50 overflow-hidden dark:bg-slate-800 dark:border-slate-700 animate-fade-in">
          <p className="px-4 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">
            Switch school
          </p>
          <div className="max-h-80 overflow-y-auto py-1">
            {isHq && (
              <button
                onClick={() => applySwitch(null)}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                <SchoolAvatar school={ALL_SCHOOLS_BRAND} className="w-7 h-7 text-[10px]" />
                <span className="min-w-0 flex-1 text-left">
                  <span className="block font-medium text-gray-900 dark:text-slate-100 truncate">
                    Golden Knot
                  </span>
                  <span className="block text-[11px] text-gray-400 dark:text-slate-500">
                    All schools
                  </span>
                </span>
                {activeSchool === null && <Check className="w-4 h-4 text-primary-600 shrink-0" />}
              </button>
            )}
            {accessibleSchools.map((school) => (
              <button
                key={school.id}
                onClick={() => applySwitch(school)}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                <SchoolAvatar school={school} className="w-7 h-7 text-[10px]" ocwFallbackCrest />
                <span className="min-w-0 flex-1 text-left">
                  <span className="block font-medium text-gray-900 dark:text-slate-100 truncate">
                    {school.name}
                  </span>
                  <span className="block text-[11px] uppercase tracking-wide text-gray-400 dark:text-slate-500">
                    {school.code}
                  </span>
                </span>
                {activeSchool?.id === school.id && (
                  <Check className="w-4 h-4 text-primary-600 shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function UserMenu() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logoutStore = useAuthStore((s) => s.logout)
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = async () => {
    try {
      await authApi.logout()
    } catch {
      // Even if the server call fails, clear the local session
    }
    logoutStore()
    navigate('/login', { replace: true })
  }

  const initials =
    user?.full_name
      ?.split(' ')
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
      >
        <span className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300 flex items-center justify-center text-xs font-semibold">
          {initials}
        </span>
        <span className="hidden sm:block text-sm font-medium text-gray-700 dark:text-slate-300 max-w-[10rem] truncate">
          {user?.full_name || user?.email || 'Account'}
        </span>
        <CaretDown className="w-4 h-4 text-gray-400" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl border border-gray-200 bg-white shadow-lg z-50 overflow-hidden dark:bg-slate-800 dark:border-slate-700 animate-fade-in">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700">
            <p className="text-sm font-medium text-gray-900 dark:text-slate-100 truncate">
              {user?.full_name || 'User'}
            </p>
            <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{user?.email}</p>
            {user?.role && (
              <p className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-slate-500 mt-1">
                {user.role}
              </p>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <SignOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

/** Non-blanking route fallback: a slim progress bar pinned to the top of the
 *  content area. Route chunks are preloaded (see App.tsx) so this rarely shows;
 *  when it does, it never replaces the page with a full skeleton. */
function RouteFallback() {
  return (
    <div className="relative h-1 -m-4 sm:-m-6 lg:-m-8">
      <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-primary-100 dark:bg-primary-900/30">
        <div className="h-full w-1/3 bg-primary-500 animate-shimmer" />
      </div>
    </div>
  )
}

export default function Layout() {
  const { theme, toggleTheme, sidebarCollapsed, toggleSidebar } = useUIStore()
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const mainRef = useRef<HTMLElement>(null)

  // Close the mobile drawer on navigation
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  // Scoped scrolling: the content pane is its own scroll container, so reset it
  // to the top on navigation (the shell keeps its own scroll position).
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [location.pathname])

  return (
    <div className="h-screen overflow-hidden bg-gray-50 dark:bg-slate-900">
      {/* Warm common dropdown/option caches once, near the shell root. */}
      <CacheWarmer />
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden lg:flex flex-col fixed inset-y-0 left-0 z-30 bg-white border-r border-gray-200 dark:bg-slate-900 dark:border-slate-700 transition-[width] duration-200',
          sidebarCollapsed ? 'w-16' : 'w-64'
        )}
      >
        <SidebarBrand collapsed={sidebarCollapsed} />
        <SidebarNav collapsed={sidebarCollapsed} />
        <div className="border-t border-gray-200 dark:border-slate-700 p-3">
          <button
            onClick={toggleSidebar}
            className="w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? (
              <CaretDoubleRight className="w-4 h-4" />
            ) : (
              <>
                <CaretDoubleLeft className="w-4 h-4" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700 flex flex-col animate-slide-up">
            <div className="flex items-center justify-between pr-3">
              <SidebarBrand collapsed={false} />
              <button
                onClick={() => setMobileOpen(false)}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <SidebarNav collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main column — full viewport height; only <main> scrolls (scoped scroll). */}
      <div
        className={cn(
          'flex flex-col h-screen transition-[padding] duration-200',
          sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64'
        )}
      >
        {/* Header — fixed row, never scrolls with the content */}
        <header className="shrink-0 z-20 h-16 flex items-center justify-between gap-3 px-4 sm:px-6 bg-white/80 backdrop-blur-xl border-b border-gray-200 dark:bg-slate-900/80 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <List className="w-5 h-5" />
            </button>
            <SchoolSwitcher />
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <UserMenu />
          </div>
        </header>

        {/* Page content — the ONLY scoped scroll container. Sidebar + header stay
            put; only this pane scrolls. Suspense lives here so lazy chunks replace
            just the content, and its fallback is a slim bar (never a full skeleton). */}
        <main ref={mainRef} className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 lg:p-8">
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
