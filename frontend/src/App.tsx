import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import PrivateRoute from '@/components/layout/PrivateRoute'
import Layout from '@/components/layout/Layout'
import { PageSkeleton } from '@/components/ui'
import { useUIStore } from '@/stores/uiStore'

const Login = lazy(() => import('@/pages/Login'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const ComingSoon = lazy(() => import('@/pages/ComingSoon'))
const ChartOfAccounts = lazy(() => import('@/pages/Accounting/ChartOfAccounts'))
const AccountLedger = lazy(() => import('@/pages/Accounting/AccountLedger'))
const Journals = lazy(() => import('@/pages/Accounting/Journals'))
const JournalDetail = lazy(() => import('@/pages/Accounting/JournalDetail'))
const JournalForm = lazy(() => import('@/pages/Accounting/JournalForm'))
const Reports = lazy(() => import('@/pages/Reports/Reports'))

// Routes with real pages (everything else stays ComingSoon until built)
const builtRoutes: [string, React.LazyExoticComponent<() => JSX.Element>][] = [
  ['reports', Reports],
  ['chart-of-accounts', ChartOfAccounts],
  ['accounts/:id', AccountLedger],
  ['journals', Journals],
  ['journals/new', JournalForm],
  ['journals/:id', JournalDetail],
  ['bank-accounts', lazy(() => import('@/pages/Accounting/BankAccounts'))],
  ['bank-accounts/:id', lazy(() => import('@/pages/Accounting/BankAccountDetail'))],
  ['bank-reconciliation', lazy(() => import('@/pages/Accounting/BankReconciliation'))],
  // Students & Fees
  ['students', lazy(() => import('@/pages/Students/Students'))],
  ['students/:id', lazy(() => import('@/pages/Students/StudentDetail'))],
  ['guardians', lazy(() => import('@/pages/Students/Guardians'))],
  ['guardians/:id', lazy(() => import('@/pages/Students/GuardianDetail'))],
  ['classes', lazy(() => import('@/pages/Students/Classes'))],
  ['classes/:id', lazy(() => import('@/pages/Students/ClassDetail'))],
  ['fee-structures', lazy(() => import('@/pages/Billing/FeeStructures'))],
  ['billing-runs', lazy(() => import('@/pages/Billing/BillingRuns'))],
  ['billing-runs/new', lazy(() => import('@/pages/Billing/BillingRunNew'))],
  ['billing-runs/:id', lazy(() => import('@/pages/Billing/BillingRunDetail'))],
  ['fee-invoices', lazy(() => import('@/pages/Billing/FeeInvoices'))],
  ['fee-invoices/:id', lazy(() => import('@/pages/Billing/FeeInvoiceDetail'))],
  ['receipts', lazy(() => import('@/pages/Billing/Receipts'))],
  ['receipts/:id', lazy(() => import('@/pages/Billing/ReceiptDetail'))],
  // Inventory
  ['items', lazy(() => import('@/pages/Inventory/Items'))],
  ['items/:id', lazy(() => import('@/pages/Inventory/ItemDetail'))],
  ['warehouses', lazy(() => import('@/pages/Inventory/Warehouses'))],
  ['warehouses/:id', lazy(() => import('@/pages/Inventory/WarehouseDetail'))],
  ['stock-moves', lazy(() => import('@/pages/Inventory/StockMoves'))],
  // Purchasing
  ['suppliers', lazy(() => import('@/pages/Purchasing/Suppliers'))],
  ['suppliers/:id', lazy(() => import('@/pages/Purchasing/SupplierDetail'))],
  ['purchase-orders', lazy(() => import('@/pages/Purchasing/PurchaseOrders'))],
  ['purchase-orders/new', lazy(() => import('@/pages/Purchasing/PurchaseOrderForm'))],
  ['purchase-orders/:id', lazy(() => import('@/pages/Purchasing/PurchaseOrderDetail'))],
  ['grns', lazy(() => import('@/pages/Purchasing/GRNs'))],
  ['grns/:id', lazy(() => import('@/pages/Purchasing/GRNDetail'))],
  ['vendor-bills', lazy(() => import('@/pages/Purchasing/VendorBills'))],
  ['vendor-bills/new', lazy(() => import('@/pages/Purchasing/VendorBillForm'))],
  ['vendor-bills/:id', lazy(() => import('@/pages/Purchasing/VendorBillDetail'))],
  ['supplier-payments', lazy(() => import('@/pages/Purchasing/SupplierPayments'))],
  ['supplier-payments/:id', lazy(() => import('@/pages/Purchasing/SupplierPaymentDetail'))],
  // Assets & Settings
  ['fixed-assets', lazy(() => import('@/pages/Assets/FixedAssets'))],
  ['fixed-assets/:id', lazy(() => import('@/pages/Assets/AssetDetail'))],
  ['settings', lazy(() => import('@/pages/Settings/Settings'))],
]

function PageFallback() {
  return <PageSkeleton />
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

  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Navigate to="/app" replace />} />
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
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </Suspense>
  )
}
