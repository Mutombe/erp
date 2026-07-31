import { lazy, Suspense, useEffect, type ComponentType, type LazyExoticComponent } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import PrivateRoute from '@/components/layout/PrivateRoute'
import Layout from '@/components/layout/Layout'
import PortalRoute from '@/components/portal/PortalRoute'
import PortalLayout from '@/components/portal/PortalLayout'
import { PageSkeleton } from '@/components/ui'
import { useUIStore } from '@/stores/uiStore'

type AnyComp = ComponentType<Record<string, never>>
type Preloadable = LazyExoticComponent<AnyComp> & { preload: () => Promise<unknown> }

/** lazy() that also lets us warm the chunk ahead of navigation, so moving
 *  between pages never suspends — the shell and each page's static chrome are
 *  already loaded; only dynamic data shows a (scoped) loading state. */
function pageLazy(factory: () => Promise<{ default: AnyComp }>): Preloadable {
  const Comp = lazy(factory) as Preloadable
  Comp.preload = factory
  return Comp
}

const Login = pageLazy(() => import('@/pages/Login'))
const Dashboard = pageLazy(() => import('@/pages/Dashboard'))
const ComingSoon = pageLazy(() => import('@/pages/ComingSoon'))

// Guardian & student portal pages (family-facing, separate shell)
const PortalHome = pageLazy(() => import('@/pages/Portal/PortalHome'))
const StudentStatementPortal = pageLazy(() => import('@/pages/Portal/StudentStatementPortal'))
const StudentAttendancePortal = pageLazy(() => import('@/pages/Portal/StudentAttendancePortal'))
const PortalPayments = pageLazy(() => import('@/pages/Portal/PortalPayments'))

// Routes with real pages (everything else stays ComingSoon until built)
const builtRoutes: [string, Preloadable][] = [
  ['reports', pageLazy(() => import('@/pages/Reports/Reports'))],
  ['chart-of-accounts', pageLazy(() => import('@/pages/Accounting/ChartOfAccounts'))],
  ['accounts/:id', pageLazy(() => import('@/pages/Accounting/AccountLedger'))],
  ['journals', pageLazy(() => import('@/pages/Accounting/Journals'))],
  ['journals/new', pageLazy(() => import('@/pages/Accounting/JournalForm'))],
  ['journals/:id', pageLazy(() => import('@/pages/Accounting/JournalDetail'))],
  ['bank-accounts', pageLazy(() => import('@/pages/Accounting/BankAccounts'))],
  ['bank-accounts/:id', pageLazy(() => import('@/pages/Accounting/BankAccountDetail'))],
  ['bank-reconciliation', pageLazy(() => import('@/pages/Accounting/BankReconciliation'))],
  ['pockets', pageLazy(() => import('@/pages/Accounting/Pockets'))],
  ['pockets/:id', pageLazy(() => import('@/pages/Accounting/PocketStatement'))],
  // Students & Fees
  ['students', pageLazy(() => import('@/pages/Students/Students'))],
  ['students/:id', pageLazy(() => import('@/pages/Students/StudentDetail'))],
  ['guardians', pageLazy(() => import('@/pages/Students/Guardians'))],
  ['guardians/:id', pageLazy(() => import('@/pages/Students/GuardianDetail'))],
  ['classes', pageLazy(() => import('@/pages/Students/Classes'))],
  ['classes/:id', pageLazy(() => import('@/pages/Students/ClassDetail'))],
  ['teachers', pageLazy(() => import('@/pages/Students/Teachers'))],
  ['teachers/:id', pageLazy(() => import('@/pages/Students/TeacherDetail'))],
  ['subjects', pageLazy(() => import('@/pages/Students/Subjects'))],
  ['subjects/:id', pageLazy(() => import('@/pages/Students/SubjectDetail'))],
  ['attendance', pageLazy(() => import('@/pages/Attendance/Attendance'))],
  ['fee-structures', pageLazy(() => import('@/pages/Billing/FeeStructures'))],
  ['billing-runs', pageLazy(() => import('@/pages/Billing/BillingRuns'))],
  ['billing-runs/new', pageLazy(() => import('@/pages/Billing/BillingRunNew'))],
  ['billing-runs/:id', pageLazy(() => import('@/pages/Billing/BillingRunDetail'))],
  ['fee-invoices', pageLazy(() => import('@/pages/Billing/FeeInvoices'))],
  ['fee-invoices/:id', pageLazy(() => import('@/pages/Billing/FeeInvoiceDetail'))],
  ['receipts', pageLazy(() => import('@/pages/Billing/Receipts'))],
  ['receipts/:id', pageLazy(() => import('@/pages/Billing/ReceiptDetail'))],
  ['payment-intents', pageLazy(() => import('@/pages/Billing/PaymentIntents'))],
  ['credit-notes', pageLazy(() => import('@/pages/Billing/CreditNotes'))],
  ['credit-notes/:id', pageLazy(() => import('@/pages/Billing/CreditNoteDetail'))],
  ['bursaries', pageLazy(() => import('@/pages/Billing/Bursaries'))],
  // Inventory
  ['items', pageLazy(() => import('@/pages/Inventory/Items'))],
  ['items/:id', pageLazy(() => import('@/pages/Inventory/ItemDetail'))],
  ['warehouses', pageLazy(() => import('@/pages/Inventory/Warehouses'))],
  ['warehouses/:id', pageLazy(() => import('@/pages/Inventory/WarehouseDetail'))],
  ['stock-moves', pageLazy(() => import('@/pages/Inventory/StockMoves'))],
  ['stock-moves/:id', pageLazy(() => import('@/pages/Inventory/StockMoveDetail'))],
  ['departments', pageLazy(() => import('@/pages/Inventory/Departments'))],
  ['departments/:id', pageLazy(() => import('@/pages/Inventory/DepartmentDetail'))],
  // Purchasing
  ['suppliers', pageLazy(() => import('@/pages/Purchasing/Suppliers'))],
  ['suppliers/:id', pageLazy(() => import('@/pages/Purchasing/SupplierDetail'))],
  ['purchase-orders', pageLazy(() => import('@/pages/Purchasing/PurchaseOrders'))],
  ['purchase-orders/new', pageLazy(() => import('@/pages/Purchasing/PurchaseOrderForm'))],
  ['purchase-orders/:id', pageLazy(() => import('@/pages/Purchasing/PurchaseOrderDetail'))],
  ['grns', pageLazy(() => import('@/pages/Purchasing/GRNs'))],
  ['grns/:id', pageLazy(() => import('@/pages/Purchasing/GRNDetail'))],
  ['vendor-bills', pageLazy(() => import('@/pages/Purchasing/VendorBills'))],
  ['vendor-bills/new', pageLazy(() => import('@/pages/Purchasing/VendorBillForm'))],
  ['vendor-bills/:id', pageLazy(() => import('@/pages/Purchasing/VendorBillDetail'))],
  ['supplier-payments', pageLazy(() => import('@/pages/Purchasing/SupplierPayments'))],
  ['supplier-payments/:id', pageLazy(() => import('@/pages/Purchasing/SupplierPaymentDetail'))],
  // Assets & Settings
  ['fixed-assets', pageLazy(() => import('@/pages/Assets/FixedAssets'))],
  ['fixed-assets/:id', pageLazy(() => import('@/pages/Assets/AssetDetail'))],
  ['settings', pageLazy(() => import('@/pages/Settings/Settings'))],
  // Document ingestion
  ['ingestion', pageLazy(() => import('@/pages/Ingestion/Inbox'))],
  ['ingestion/:id', pageLazy(() => import('@/pages/Ingestion/ReviewItem'))],
  // Inter-school transfers (HQ only)
  ['transfers', pageLazy(() => import('@/pages/Transfers/Transfers'))],
]

/** Warm every route chunk once the browser is idle after first paint. After
 *  this runs, navigating never hits the Suspense fallback. */
function preloadAllRoutes() {
  const all = [Dashboard, ComingSoon, ...builtRoutes.map(([, c]) => c)]
  let i = 0
  const pump = () => {
    // A few at a time so we never contend with the current view's own fetches.
    for (let n = 0; n < 4 && i < all.length; n++, i++) all[i].preload().catch(() => {})
    if (i < all.length) schedule(pump)
  }
  const schedule = (fn: () => void) =>
    'requestIdleCallback' in window
      ? (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(fn)
      : setTimeout(fn, 200)
  schedule(pump)
}

// Every route that isn't built yet renders the shared ComingSoon page.
const comingSoonPaths = [
  'fee-structures/:id',
]

export default function App() {
  const theme = useUIStore((s) => s.theme)

  // Apply / remove the dark class on the root element app-wide
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // Warm all page chunks in the background so navigation is instant.
  useEffect(() => {
    preloadAllRoutes()
  }, [])

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <Suspense fallback={<PageSkeleton />}>
            <Login />
          </Suspense>
        }
      />
      <Route path="/" element={<Navigate to="/app" replace />} />
      {/*
        No Suspense here: Layout renders its own boundary around <Outlet /> so the
        sidebar + header never unmount while a lazy route chunk loads.
      */}
      <Route
        path="/app"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        {builtRoutes.map(([path, Component]) => (
          <Route key={path} path={path} element={<Component />} />
        ))}
        {comingSoonPaths.map((path) => (
          <Route key={path} path={path} element={<ComingSoon />} />
        ))}
        <Route path="*" element={<ComingSoon />} />
      </Route>

      {/*
        Guardian & student portal — a separate top-level tree with its own light
        shell. PortalLayout renders its own Suspense boundary around <Outlet />.
      */}
      <Route
        path="/portal"
        element={
          <PortalRoute>
            <PortalLayout />
          </PortalRoute>
        }
      >
        <Route index element={<PortalHome />} />
        <Route path="students/:id" element={<StudentStatementPortal />} />
        <Route path="students/:id/attendance" element={<StudentAttendancePortal />} />
        <Route path="payments" element={<PortalPayments />} />
      </Route>

      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  )
}
