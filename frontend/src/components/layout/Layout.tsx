import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeftRight,
  BarChart3,
  BookOpen,
  Building2,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  CreditCard,
  FileText,
  GitCompareArrows,
  GraduationCap,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  NotebookPen,
  Package,
  PackageCheck,
  PlayCircle,
  Receipt,
  ReceiptText,
  School,
  Settings,
  ShoppingCart,
  Sun,
  Truck,
  Users,
  Wallet,
  Warehouse,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { authApi } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'

interface NavItem {
  label: string
  to: string
  icon: LucideIcon
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
      { label: 'Dashboard', to: '/app', icon: LayoutDashboard, end: true },
      { label: 'Reports', to: '/app/reports', icon: BarChart3 },
    ],
  },
  {
    label: 'Students & Fees',
    items: [
      { label: 'Students', to: '/app/students', icon: GraduationCap },
      { label: 'Guardians', to: '/app/guardians', icon: Users },
      { label: 'Classes', to: '/app/classes', icon: School },
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
      { label: 'Journals', to: '/app/journals', icon: NotebookPen },
      { label: 'Bank Accounts', to: '/app/bank-accounts', icon: Landmark },
      { label: 'Reconciliation', to: '/app/bank-reconciliation', icon: GitCompareArrows },
      { label: 'Fixed Assets', to: '/app/fixed-assets', icon: Building2 },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { label: 'Items', to: '/app/items', icon: Package },
      { label: 'Warehouses', to: '/app/warehouses', icon: Warehouse },
      { label: 'Stock Moves', to: '/app/stock-moves', icon: ArrowLeftRight },
    ],
  },
  {
    label: 'Purchasing',
    items: [
      { label: 'Suppliers', to: '/app/suppliers', icon: Truck },
      { label: 'Purchase Orders', to: '/app/purchase-orders', icon: ShoppingCart },
      { label: 'GRNs', to: '/app/grns', icon: PackageCheck },
      { label: 'Vendor Bills', to: '/app/vendor-bills', icon: ReceiptText },
      { label: 'Supplier Payments', to: '/app/supplier-payments', icon: CreditCard },
    ],
  },
  {
    label: 'Settings',
    items: [{ label: 'Settings', to: '/app/settings', icon: Settings }],
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

function SidebarBrand({ collapsed }: { collapsed: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 h-16 border-b border-gray-200 dark:border-slate-700',
        collapsed ? 'justify-center px-2' : 'px-5'
      )}
    >
      <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center shrink-0">
        <GraduationCap className="w-5 h-5 text-white" />
      </div>
      {!collapsed && (
        <span className="font-bold text-gray-900 dark:text-slate-100 truncate">School ERP</span>
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
        <ChevronDown className="w-4 h-4 text-gray-400" />
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
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

export default function Layout() {
  const { theme, toggleTheme, sidebarCollapsed, toggleSidebar } = useUIStore()
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  // Close the mobile drawer on navigation
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
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
              <ChevronsRight className="w-4 h-4" />
            ) : (
              <>
                <ChevronsLeft className="w-4 h-4" />
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

      {/* Main column */}
      <div
        className={cn(
          'flex flex-col min-h-screen transition-[padding] duration-200',
          sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64'
        )}
      >
        {/* Header */}
        <header className="sticky top-0 z-20 h-16 flex items-center justify-between gap-3 px-4 sm:px-6 bg-white/80 backdrop-blur-xl border-b border-gray-200 dark:bg-slate-900/80 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="font-semibold text-gray-900 dark:text-slate-100">School ERP</span>
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

        {/* Page content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
