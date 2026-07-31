import axios, { type InternalAxiosRequestConfig } from 'axios'
import { useSessionStore } from '@/stores/sessionStore'

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 120000, // 2 minutes — handles large operations like billing runs
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add CSRF token for Django session auth
api.interceptors.request.use((config) => {
  const csrfToken = document.cookie
    .split('; ')
    .find((row) => row.startsWith('csrftoken='))
    ?.split('=')[1]

  if (csrfToken) {
    config.headers['X-CSRFToken'] = csrfToken
  }

  return config
})

// 401 handling: flag the session as expired and queue the failed request
// so it can be replayed after re-login (the caller's promise stays pending).
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const path = window.location.pathname
      const url = (error.config as InternalAxiosRequestConfig)?.url || ''

      // Guard: skip for public pages and the login/me endpoints themselves
      const isPublicPage = path === '/login' || path === '/'
      const isAuthRequest = url.includes('/auth/login') || url.includes('/auth/me')

      if (!isPublicPage && !isAuthRequest) {
        const sessionStore = useSessionStore.getState()

        // Only trigger the modal once for concurrent 401s
        if (!sessionStore.isSessionExpired) {
          sessionStore.setSessionExpired(true)
        }

        // Queue the failed request — caller suspends until re-login replays it
        return new Promise((resolve, reject) => {
          sessionStore.addToQueue({
            config: error.config as InternalAxiosRequestConfig,
            resolve,
            reject,
          })
        })
      }
    }
    return Promise.reject(error)
  }
)

/** Replay all queued requests after a successful re-login. */
export async function replayQueuedRequests(): Promise<void> {
  const sessionStore = useSessionStore.getState()
  const queue = sessionStore.drainQueue()
  sessionStore.setSessionExpired(false)
  for (const { config, resolve, reject } of queue) {
    api
      .request(config)
      .then(resolve)
      .catch(reject)
  }
}

export type Id = string | number
export type ListParams = Record<string, unknown>

/** Uniform CRUD module for a DRF viewset endpoint. */
function crud(base: string) {
  return {
    list: (params?: ListParams) => api.get(`/${base}/`, { params }),
    get: (id: Id) => api.get(`/${base}/${id}/`),
    create: (data: object) => api.post(`/${base}/`, data),
    update: (id: Id, data: object) => api.patch(`/${base}/${id}/`, data),
    delete: (id: Id) => api.delete(`/${base}/${id}/`),
  }
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

export const authApi = {
  login: (data: { school?: string | number | null; email: string; password: string }) =>
    api.post('/core/auth/login/', data),
  logout: () => api.post('/core/auth/logout/'),
  me: () => api.get('/core/auth/me/'),
  switchSchool: (school: string | number | null) =>
    api.post('/core/auth/switch-school/', { school }),
}

// Public (pre-login) endpoints — no auth/session required.
export const publicApi = {
  schools: () => api.get('/public/schools/'),
}

export const usersApi = crud('core/users')

/** Permission "Lego" admin: the schema vocabulary, per-(school,role) role
 *  matrices and per-user overrides. Responses wrap the matrix under
 *  `permissions` / `overrides`; callers read those keys. */
export const permissionsApi = {
  schema: () => api.get('/core/permission-schema/'),
  roleMatrix: (school: Id, role: string) =>
    api.get('/core/role-permissions/', { params: { school, role } }),
  setRoleMatrix: (school: Id, role: string, permissions: object) =>
    api.put('/core/role-permissions/', { school, role, permissions }),
  userOverrides: (userId: Id) => api.get(`/core/user-overrides/${userId}/`),
  setUserOverrides: (userId: Id, overrides: object) =>
    api.put(`/core/user-overrides/${userId}/`, { overrides }),
}

export const settingsApi = crud('core/settings')
export const sequencesApi = crud('core/sequences')
export const auditTrailApi = crud('core/audit-trail')

// ---------------------------------------------------------------------------
// Accounting
// ---------------------------------------------------------------------------

export const accountsApi = crud('accounting/accounts')

export const journalsApi = {
  ...crud('accounting/journals'),
  post: (id: Id) => api.post(`/accounting/journals/${id}/post/`),
  reverse: (id: Id, reason: string) => api.post(`/accounting/journals/${id}/reverse/`, { reason }),
}

export const generalLedgerApi = crud('accounting/general-ledger')
export const subAccountsApi = {
  ...crud('accounting/sub-accounts'),
  transactions: (id: Id, params?: ListParams) =>
    api.get(`/accounting/sub-accounts/${id}/transactions/`, { params }),
}
export const bankAccountsApi = crud('accounting/bank-accounts')
export const bankStatementsApi = {
  ...crud('accounting/bank-statements'),
  upload: (formData: FormData) =>
    api.post('/accounting/bank-statements/upload/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
}

export const bankReconciliationsApi = {
  ...crud('accounting/bank-reconciliations'),
  toggleItem: (id: Id, itemId: Id) =>
    api.post(`/accounting/bank-reconciliations/${id}/toggle_item/`, { item: itemId }),
  complete: (id: Id, force = false) =>
    api.post(`/accounting/bank-reconciliations/${id}/complete/`, { force }),
}

export const exchangeRatesApi = crud('accounting/exchange-rates')
export const fiscalYearsApi = crud('accounting/fiscal-years')

export const fiscalPeriodsApi = {
  ...crud('accounting/fiscal-periods'),
  lock: (id: Id) => api.post(`/accounting/fiscal-periods/${id}/lock/`),
}

export const openingBalancesApi = {
  ...crud('accounting/opening-balances'),
  post: (id: Id) => api.post(`/accounting/opening-balances/${id}/post/`),
}

export const mappingsApi = crud('accounting/mappings')

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

export const academicYearsApi = crud('students/academic-years')
export const termsApi = crud('students/terms')
export const gradesApi = crud('students/grades')
export const classesApi = crud('students/classes')

export const studentsApi = {
  ...crud('students/students'),
  statement: (id: Id, params?: ListParams) =>
    api.get(`/students/students/${id}/statement/`, { params }),
}

export const guardiansApi = crud('students/guardians')
export const enrollmentsApi = crud('students/enrollments')

export const subjectsApi = crud('students/subjects')

export const teachersApi = {
  ...crud('students/teachers'),
  students: (id: Id, params?: ListParams) =>
    api.get(`/students/teachers/${id}/students/`, { params }),
  classes: (id: Id, params?: ListParams) =>
    api.get(`/students/teachers/${id}/classes/`, { params }),
}

export const teachingAssignmentsApi = crud('students/teaching-assignments')

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export const attendanceSessionsApi = {
  ...crud('attendance/sessions'),
  mark: (id: Id, payload: object) => api.post(`/attendance/sessions/${id}/mark/`, payload),
}

export const attendanceRecordsApi = crud('attendance/records')

// ---------------------------------------------------------------------------
// Fees
// ---------------------------------------------------------------------------

export const feeCategoriesApi = crud('fees/categories')
export const feeStructuresApi = crud('fees/structures')

export const billingRunsApi = {
  ...crud('fees/billing-runs'),
  preview: (id: Id) => api.post(`/fees/billing-runs/${id}/preview/`),
  execute: (id: Id) => api.post(`/fees/billing-runs/${id}/execute/`),
}

export const feeInvoicesApi = {
  ...crud('fees/invoices'),
  post: (id: Id) => api.post(`/fees/invoices/${id}/post/`),
  cancel: (id: Id, reason?: string) => api.post(`/fees/invoices/${id}/cancel/`, { reason }),
}

export const creditNotesApi = {
  ...crud('fees/credit-notes'),
  post: (id: Id) => api.post(`/fees/credit-notes/${id}/post/`),
}

export const receiptsApi = {
  // POST creates-and-posts a receipt in one step
  ...crud('fees/receipts'),
  reverse: (id: Id, reason: string) => api.post(`/fees/receipts/${id}/reverse/`, { reason }),
}

export const bursariesApi = crud('fees/bursaries')

/** Back-office bursar queue for guardian/student payment declarations. */
export const paymentIntentsApi = {
  ...crud('fees/payment-intents'), // list/get only used
  confirm: (id: Id, data: object) => api.post(`/fees/payment-intents/${id}/confirm/`, data),
  reject: (id: Id, reason: string) => api.post(`/fees/payment-intents/${id}/reject/`, { reason }),
}

// ---------------------------------------------------------------------------
// Portal (guardian & student self-service — session auth, portal-role users)
// ---------------------------------------------------------------------------

export const portalApi = {
  context: () => api.get('/portal/context/'),
  statement: (id: Id) => api.get(`/portal/students/${id}/statement/`),
  attendance: (id: Id, params?: ListParams) =>
    api.get(`/portal/students/${id}/attendance/`, { params }),
  listIntents: () => api.get('/portal/payment-intents/'),
  createIntent: (data: object) => api.post('/portal/payment-intents/', data),
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export const itemCategoriesApi = crud('inventory/categories')
export const itemsApi = crud('inventory/items')
export const warehousesApi = crud('inventory/warehouses')
export const departmentsApi = crud('inventory/departments')

export const stockMovesApi = {
  ...crud('inventory/stock-moves'),
  issue: (payload: object) => api.post('/inventory/stock-ops/issue/', payload),
  transferStock: (payload: object) => api.post('/inventory/stock-ops/transfer/', payload),
  receive: (payload: object) => api.post('/inventory/stock-ops/receive/', payload),
}

export const stockLevelsApi = crud('inventory/stock-levels')

// ---------------------------------------------------------------------------
// Procurement
// ---------------------------------------------------------------------------

export const suppliersApi = crud('procurement/suppliers')

export const purchaseOrdersApi = {
  ...crud('procurement/purchase-orders'),
  approve: (id: Id) => api.post(`/procurement/purchase-orders/${id}/approve/`),
}

export const grnsApi = {
  ...crud('procurement/grns'),
  post: (id: Id) => api.post(`/procurement/grns/${id}/post/`),
}

export const vendorBillsApi = {
  ...crud('procurement/vendor-bills'),
  post: (id: Id) => api.post(`/procurement/vendor-bills/${id}/post/`),
}

export const supplierPaymentsApi = crud('procurement/supplier-payments')

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

export const assetCategoriesApi = crud('assets/categories')

export const assetsApi = {
  ...crud('assets/assets'),
  dispose: (id: Id, payload: object) => api.post(`/assets/assets/${id}/dispose/`, payload),
}

export const depreciationRunsApi = {
  ...crud('assets/depreciation-runs'),
  run: (period: Id) => api.post('/assets/depreciation-runs/run/', { period }),
  reverse: (id: Id, reason: string) => api.post(`/assets/depreciation-runs/${id}/reverse/`, { reason }),
}

// ---------------------------------------------------------------------------
// Ingestion (document inbox: upload → AI extract → review → approve posts)
// ---------------------------------------------------------------------------

export const ingestionApi = {
  ...crud('ingestion/items'),
  upload: (formData: FormData) =>
    api.post('/ingestion/items/upload/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  extract: (id: Id) => api.post(`/ingestion/items/${id}/extract/`),
  editExtraction: (id: Id, payload: object) =>
    api.patch(`/ingestion/items/${id}/extraction/`, payload),
  approve: (id: Id) => api.post(`/ingestion/items/${id}/approve/`),
  reject: (id: Id, reason: string) => api.post(`/ingestion/items/${id}/reject/`, { reason }),
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export const reportsApi = {
  trialBalance: (params?: ListParams) => api.get('/reports/trial-balance/', { params }),
  balanceSheet: (params?: ListParams) => api.get('/reports/balance-sheet/', { params }),
  incomeStatement: (params?: ListParams) => api.get('/reports/income-statement/', { params }),
  agedReceivables: (params?: ListParams) => api.get('/reports/aged-receivables/', { params }),
  agedPayables: (params?: ListParams) => api.get('/reports/aged-payables/', { params }),
  studentStatement: (id: Id, params?: ListParams) =>
    api.get(`/reports/student-statement/${id}/`, { params }),
  cashbook: (params?: ListParams) => api.get('/reports/cashbook/', { params }),
  cashFlow: (params?: ListParams) => api.get('/reports/cash-flow/', { params }),
  assetRegister: (params?: ListParams) => api.get('/reports/asset-register/', { params }),
  stockValuation: (params?: ListParams) => api.get('/reports/stock-valuation/', { params }),
  feeCollection: (params?: ListParams) => api.get('/reports/fee-collection/', { params }),
  receiptListing: (params?: ListParams) => api.get('/reports/receipt-listing/', { params }),
  departmentConsumption: (params?: ListParams) =>
    api.get('/reports/department-consumption/', { params }),
  attendanceSummary: (params?: ListParams) => api.get('/reports/attendance-summary/', { params }),
  attendanceRegister: (params?: ListParams) => api.get('/reports/attendance-register/', { params }),
  dashboard: () => api.get('/reports/dashboard/'),
}

// ---------------------------------------------------------------------------
// Inter-school transfers (Golden Knot HQ only)
// ---------------------------------------------------------------------------

export const transfersApi = {
  ...crud('transfers/transfers'), // list/get used
  funds: (data: object) => api.post('/transfers/transfers/funds/', data),
  student: (data: object) => api.post('/transfers/transfers/student/', data),
  studentPreview: (studentId: Id) =>
    api.get('/transfers/transfers/student-preview/', { params: { student: studentId } }),
}

export default api
