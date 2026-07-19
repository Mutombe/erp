import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CalendarCheck, FileUp, Landmark, Scale, Upload, Wallet } from 'lucide-react'
import { bankAccountsApi, bankStatementsApi, reportsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { showToast, parseApiError } from '@/lib/toast'
import {
  Accordion,
  Badge,
  Button,
  Input,
  Modal,
  ModalFooter,
  PageHeader,
  SkeletonCard,
  SkeletonTable,
  StatsCard,
} from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import type { BankAccountRow } from './BankAccounts'

interface CashbookRow {
  date: string
  journal_id: number
  journal_number: string
  description: string
  reference: string
  received: number | string
  paid: number | string
  balance: number | string
}

interface CashbookData {
  bank_account: { id: number; name: string; currency: string }
  start: string
  end: string
  opening_balance: number | string
  rows: CashbookRow[]
  closing_balance: number | string
}

interface StatementLine {
  id: number
  date: string
  description: string
  reference: string
  debit: string
  credit: string
  status: 'unmatched' | 'matched' | 'disputed'
}

interface BankStatement {
  id: number
  bank_account: number
  bank_account_name: string
  statement_date: string
  opening_balance: string
  closing_balance: string
  uploaded_at: string
  lines: StatementLine[]
}

const money = (v: number | string) =>
  Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const today = () => new Date().toISOString().slice(0, 10)
const monthStart = () => `${new Date().toISOString().slice(0, 7)}-01`

const STATEMENT_LINE_VARIANTS: Record<StatementLine['status'], 'success' | 'warning' | 'danger'> = {
  matched: 'success',
  unmatched: 'warning',
  disputed: 'danger',
}

function UploadStatementModal({
  open,
  onClose,
  bankAccountId,
}: {
  open: boolean
  onClose: () => void
  bankAccountId: string
}) {
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [openingBalance, setOpeningBalance] = useState('')
  const [closingBalance, setClosingBalance] = useState('')

  const mutation = useMutation({
    mutationFn: () => {
      const formData = new FormData()
      formData.append('bank_account', bankAccountId)
      formData.append('file', file!)
      if (openingBalance) formData.append('opening_balance', openingBalance)
      if (closingBalance) formData.append('closing_balance', closingBalance)
      return bankStatementsApi.upload(formData)
    },
    onSuccess: () => {
      showToast.success('Statement imported')
      queryClient.invalidateQueries({ queryKey: qk.bankStatements.all })
      setFile(null)
      setOpeningBalance('')
      setClosingBalance('')
      onClose()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to import statement')),
  })

  return (
    <Modal open={open} onClose={onClose} title="Upload Bank Statement" icon={FileUp}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!file) {
            showToast.error('Choose a CSV file to upload')
            return
          }
          mutation.mutate()
        }}
        className="space-y-4"
      >
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Statement CSV
          </label>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-gray-600 dark:text-gray-300 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-primary-50 file:text-primary-700 file:text-sm file:font-medium hover:file:bg-primary-100"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Header row required: date, description, reference, debit, credit.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            type="number"
            step="0.01"
            label="Opening balance (optional)"
            value={openingBalance}
            onChange={(e) => setOpeningBalance(e.target.value)}
          />
          <Input
            type="number"
            step="0.01"
            label="Closing balance (optional)"
            value={closingBalance}
            onChange={(e) => setClosingBalance(e.target.value)}
          />
        </div>
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={mutation.isPending}>Upload Statement</Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}

export default function BankAccountDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [start, setStart] = useState(monthStart())
  const [end, setEnd] = useState(today())
  const [uploadOpen, setUploadOpen] = useState(false)

  const { data: account, isLoading } = useQuery({
    queryKey: qk.bankAccounts.detail(id!),
    queryFn: () => bankAccountsApi.get(id!).then((r) => r.data as BankAccountRow),
  })

  const { data: cashbook, isLoading: cashbookLoading } = useQuery({
    queryKey: qk.reports.cashbook({ bank_account: id, start, end }),
    queryFn: () =>
      reportsApi.cashbook({ bank_account: id, start, end }).then((r) => r.data as CashbookData),
    enabled: !!id,
  })

  const { data: statements } = useQuery({
    queryKey: qk.bankStatements.list({ bank_account: id }),
    queryFn: () =>
      bankStatementsApi
        .list({ bank_account: id })
        .then((r) => (r.data as Paginated<BankStatement>).results),
    enabled: !!id,
  })

  if (isLoading || !account) return <SkeletonCard />

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${account.code} · ${account.name}`}
        description={`${account.bank_name || 'No bank'}${account.branch ? ` · ${account.branch}` : ''} · ${account.currency} · GL ${account.gl_account_code}`}
        icon={Landmark}
        backLink="/app/bank-accounts"
        actions={
          <div className="flex items-center gap-2">
            {account.is_default && <Badge variant="info">Default</Badge>}
            {!account.is_active && <Badge variant="default">Inactive</Badge>}
            <Button variant="secondary" onClick={() => setUploadOpen(true)}>
              <Upload className="w-4 h-4 mr-2" /> Upload Statement
            </Button>
            <Button onClick={() => navigate(`/app/bank-reconciliation?account=${account.id}`)}>
              <Scale className="w-4 h-4 mr-2" /> Reconcile
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatsCard
          title="Book balance"
          value={money(account.book_balance)}
          subtitle="Per the general ledger"
          icon={Wallet}
          color="blue"
        />
        <StatsCard
          title="Bank balance"
          value={money(account.bank_balance)}
          subtitle="Per the last reconciled statement"
          icon={Landmark}
          color="purple"
        />
        <StatsCard
          title="Last reconciled"
          value={account.last_reconciled_date || 'Never'}
          subtitle={
            account.last_reconciled_balance != null
              ? `Statement balance ${money(account.last_reconciled_balance)}`
              : 'No completed reconciliation yet'
          }
          icon={CalendarCheck}
          color="green"
        />
      </div>

      <div>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Cashbook</h3>
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <label>
              From{' '}
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="ml-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
              />
            </label>
            <label>
              To{' '}
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="ml-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
              />
            </label>
          </div>
        </div>

        {cashbookLoading || !cashbook ? (
          <SkeletonTable rows={8} />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Journal</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Received</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-gray-100 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/40 font-medium">
                  <td className="px-4 py-2.5">{cashbook.start}</td>
                  <td className="px-4 py-2.5" colSpan={4}>Opening balance</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(cashbook.opening_balance)}</td>
                </tr>
                {cashbook.rows.map((row, idx) => (
                  <tr key={idx} className="border-t border-gray-100 dark:border-gray-700/50">
                    <td className="px-4 py-2.5 whitespace-nowrap">{row.date}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      <Link to={`/app/journals/${row.journal_id}`} className="text-primary-600 dark:text-primary-400 hover:underline">
                        {row.journal_number}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 max-w-sm truncate">{row.description || row.reference || '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {Number(row.received) !== 0 ? money(row.received) : ''}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {Number(row.paid) !== 0 ? money(row.paid) : ''}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{money(row.balance)}</td>
                  </tr>
                ))}
                {cashbook.rows.length === 0 && (
                  <tr className="border-t border-gray-100 dark:border-gray-700/50">
                    <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                      No bank movements in this period.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold">
                <tr>
                  <td className="px-4 py-3" colSpan={5}>Closing balance ({cashbook.end})</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(cashbook.closing_balance)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Uploaded statements</h3>
        {(statements ?? []).length === 0 ? (
          <p className="text-sm text-gray-500">
            No statements uploaded yet. Import a CSV statement to start matching against the cashbook.
          </p>
        ) : (
          (statements ?? []).map((statement) => (
            <Accordion
              key={statement.id}
              defaultOpen={false}
              title={`Statement · ${statement.statement_date}`}
              right={
                <span className="text-xs text-gray-500 tabular-nums">
                  {statement.lines.length} lines · closing {money(statement.closing_balance)}
                </span>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                    <tr>
                      <th className="px-4 py-2">Date</th>
                      <th className="px-4 py-2">Description</th>
                      <th className="px-4 py-2 text-right">Debit</th>
                      <th className="px-4 py-2 text-right">Credit</th>
                      <th className="px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.lines.map((line) => (
                      <tr key={line.id} className="border-t border-gray-100 dark:border-gray-700/50">
                        <td className="px-4 py-2 whitespace-nowrap">{line.date}</td>
                        <td className="px-4 py-2 max-w-sm truncate">
                          {line.description || line.reference || '—'}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {Number(line.debit) !== 0 ? money(line.debit) : ''}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {Number(line.credit) !== 0 ? money(line.credit) : ''}
                        </td>
                        <td className="px-4 py-2">
                          <Badge variant={STATEMENT_LINE_VARIANTS[line.status] ?? 'default'} size="sm">
                            {line.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Accordion>
          ))
        )}
      </div>

      <UploadStatementModal open={uploadOpen} onClose={() => setUploadOpen(false)} bankAccountId={id!} />
    </div>
  )
}
