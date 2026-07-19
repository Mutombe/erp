// Fixed assets + fiscal calendar types, mirroring backend serializers.
// Decimal fields arrive as strings from DRF serializers, but computed
// report values may arrive as numbers — always coerce with Number().

export interface AssetCategory {
  id: number
  code: string
  name: string
  depreciation_method: 'straight_line' | 'reducing_balance'
  useful_life_months: number
  residual_rate: string
  annual_rate: string
  asset_account: number
  accum_depr_account: number
  depr_expense_account: number
}

export interface Asset {
  id: number
  code: string
  name: string
  category: number
  category_name: string
  description: string
  serial_number: string
  location: string
  custodian: string
  acquisition_date: string
  in_service_date: string
  cost: string
  currency: string
  cost_base: string
  residual_value: string
  depreciation_method: string
  useful_life_months: number | null
  annual_rate: string | null
  accumulated_depreciation: string
  net_book_value: string | number
  status: 'draft' | 'active' | 'fully_depreciated' | 'disposed' | 'written_off'
  capitalization_journal: number | null
  disposal_date: string | null
  disposal_proceeds: string | null
  disposal_journal: number | null
  disposal_journal_number: string | null
  custom_fields: Record<string, unknown>
  created_at: string
}

export interface DepreciationEntry {
  id: number
  asset: number
  asset_code: string
  asset_name: string
  amount: string
  accumulated_after: string
  nbv_after: string
}

export interface DepreciationRun {
  id: number
  period: number
  period_label: string
  run_date: string
  status: 'draft' | 'posted' | 'reversed'
  journal: number | null
  journal_number: string | null
  total_amount: string
  entries: DepreciationEntry[]
  created_by: number | null
  created_at: string
}

export interface FiscalPeriod {
  id: number
  fiscal_year: number
  period_no: number
  start_date: string
  end_date: string
  is_locked: boolean
  locked_by: number | null
  locked_at: string | null
}

export interface FiscalYear {
  id: number
  name: string
  start_date: string
  end_date: string
  status: 'open' | 'closed'
  periods: FiscalPeriod[]
}

/** Shape of /reports/asset-register/ */
export interface AssetRegisterData {
  rows: {
    id: number
    code: string
    name: string
    category: string
    acquisition_date: string
    cost: number | string
    accumulated_depreciation: number | string
    net_book_value: number | string
    status: string
  }[]
  category_totals: Record<string, { cost: number | string; accum: number | string; nbv: number | string }>
  total_cost: number | string
  total_accumulated: number | string
  total_nbv: number | string
}

export const ASSET_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  active: 'Active',
  fully_depreciated: 'Fully depreciated',
  disposed: 'Disposed',
  written_off: 'Written off',
}
