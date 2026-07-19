import type { QueryKey } from '@tanstack/react-query'

type Id = string | number
type Filters = Record<string, unknown>

/**
 * Central query key factory.
 *
 * Convention:
 *   qk.students.all            -> ['students']                      (prefix — use for invalidation)
 *   qk.students.list(filters)  -> ['students', 'list', {filters}]   (object filters, never positional)
 *   qk.students.detail(id)     -> ['students', 'detail', id]
 */
function entityKeys(name: string) {
  const all = [name] as const
  return {
    all: all as unknown as QueryKey,
    lists: () => [name, 'list'] as QueryKey,
    list: (filters: Filters = {}) => [name, 'list', filters] as QueryKey,
    detail: (id: Id) => [name, 'detail', id] as QueryKey,
  }
}

export const qk = {
  // Core
  auth: {
    me: ['auth', 'me'] as QueryKey,
  },
  users: entityKeys('users'),
  settings: entityKeys('settings'),
  sequences: entityKeys('sequences'),
  auditTrail: entityKeys('auditTrail'),

  // Accounting
  accounts: entityKeys('accounts'),
  journals: entityKeys('journals'),
  generalLedger: entityKeys('generalLedger'),
  subAccounts: entityKeys('subAccounts'),
  bankAccounts: entityKeys('bankAccounts'),
  bankStatements: entityKeys('bankStatements'),
  bankReconciliations: entityKeys('bankReconciliations'),
  exchangeRates: entityKeys('exchangeRates'),
  fiscalYears: entityKeys('fiscalYears'),
  fiscalPeriods: entityKeys('fiscalPeriods'),
  openingBalances: entityKeys('openingBalances'),
  mappings: entityKeys('mappings'),

  // Students
  academicYears: entityKeys('academicYears'),
  terms: entityKeys('terms'),
  grades: entityKeys('grades'),
  classes: entityKeys('classes'),
  students: {
    ...entityKeys('students'),
    statement: (id: Id, filters: Filters = {}) => ['students', 'statement', id, filters] as QueryKey,
  },
  guardians: entityKeys('guardians'),
  enrollments: entityKeys('enrollments'),

  // Fees
  feeCategories: entityKeys('feeCategories'),
  feeStructures: entityKeys('feeStructures'),
  billingRuns: entityKeys('billingRuns'),
  feeInvoices: entityKeys('feeInvoices'),
  creditNotes: entityKeys('creditNotes'),
  receipts: entityKeys('receipts'),
  bursaries: entityKeys('bursaries'),

  // Inventory
  itemCategories: entityKeys('itemCategories'),
  items: entityKeys('items'),
  warehouses: entityKeys('warehouses'),
  stockMoves: entityKeys('stockMoves'),
  stockLevels: entityKeys('stockLevels'),

  // Procurement
  suppliers: entityKeys('suppliers'),
  purchaseOrders: entityKeys('purchaseOrders'),
  grns: entityKeys('grns'),
  vendorBills: entityKeys('vendorBills'),
  supplierPayments: entityKeys('supplierPayments'),

  // Assets
  assetCategories: entityKeys('assetCategories'),
  assets: entityKeys('assets'),
  depreciationRuns: entityKeys('depreciationRuns'),

  // Reports
  reports: {
    all: ['reports'] as QueryKey,
    dashboard: ['reports', 'dashboard'] as QueryKey,
    trialBalance: (filters: Filters = {}) => ['reports', 'trialBalance', filters] as QueryKey,
    balanceSheet: (filters: Filters = {}) => ['reports', 'balanceSheet', filters] as QueryKey,
    incomeStatement: (filters: Filters = {}) => ['reports', 'incomeStatement', filters] as QueryKey,
    agedReceivables: (filters: Filters = {}) => ['reports', 'agedReceivables', filters] as QueryKey,
    agedPayables: (filters: Filters = {}) => ['reports', 'agedPayables', filters] as QueryKey,
    studentStatement: (id: Id, filters: Filters = {}) =>
      ['reports', 'studentStatement', id, filters] as QueryKey,
    cashbook: (filters: Filters = {}) => ['reports', 'cashbook', filters] as QueryKey,
    cashFlow: (filters: Filters = {}) => ['reports', 'cashFlow', filters] as QueryKey,
    assetRegister: (filters: Filters = {}) => ['reports', 'assetRegister', filters] as QueryKey,
    stockValuation: (filters: Filters = {}) => ['reports', 'stockValuation', filters] as QueryKey,
    feeCollection: (filters: Filters = {}) => ['reports', 'feeCollection', filters] as QueryKey,
  },
} as const

export default qk
