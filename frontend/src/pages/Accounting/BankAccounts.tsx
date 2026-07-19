import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Bank, PencilSimple, Plus } from '@phosphor-icons/react'
import { accountsApi, bankAccountsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { useOptimisticCreate, useOptimisticUpdate } from '@/hooks/useOptimisticMutation'
import {
  Badge,
  Button,
  DataTable,
  FormRow,
  Input,
  Modal,
  ModalFooter,
  PageHeader,
  Select,
  type Column,
} from '@/components/ui'
import type { Account, BankAccount } from '@/types/accounting'

/** Serializer exposes every model field — extend the shared type with the extras. */
export interface BankAccountRow extends BankAccount {
  last_reconciled_date: string | null
  last_reconciled_balance: string | null
}

const ACCOUNT_TYPE_LABELS: Record<BankAccount['account_type'], string> = {
  bank: 'Bank',
  mobile_money: 'Mobile Money',
  cash: 'Cash',
}

const money = (v: number | string) =>
  Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const schema = z.object({
  code: z.string().min(1, 'Code is required'),
  name: z.string().min(2, 'Name is required'),
  account_type: z.enum(['bank', 'mobile_money', 'cash']),
  bank_name: z.string().default(''),
  branch: z.string().default(''),
  account_number: z.string().default(''),
  currency: z.enum(['USD', 'ZWG']),
  gl_account: z.coerce.number().min(1, 'GL account is required'),
  is_default: z.boolean().default(false),
})

type FormValues = z.infer<typeof schema>

const emptyValues: FormValues = {
  code: '',
  name: '',
  account_type: 'bank',
  bank_name: '',
  branch: '',
  account_number: '',
  currency: 'USD',
  gl_account: 0,
  is_default: false,
}

function BankAccountFormModal({
  open,
  onClose,
  account,
}: {
  open: boolean
  onClose: () => void
  account?: BankAccountRow | null
}) {
  const { data: accounts } = useQuery({
    queryKey: qk.accounts.list({ is_active: true }),
    queryFn: () => accountsApi.list({ is_active: true }).then((r) => r.data as Account[]),
    enabled: open,
  })
  const cashAccounts = (accounts ?? []).filter((a) => a.account_subtype === 'cash')

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: emptyValues })

  useEffect(() => {
    if (!open) return
    if (account) {
      reset({
        code: account.code,
        name: account.name,
        account_type: account.account_type,
        bank_name: account.bank_name,
        branch: account.branch,
        account_number: account.account_number,
        currency: account.currency === 'ZWG' ? 'ZWG' : 'USD',
        gl_account: account.gl_account ?? 0,
        is_default: account.is_default,
      })
    } else {
      reset(emptyValues)
    }
  }, [open, account, reset])

  const closeModal = () => {
    reset(emptyValues)
    onClose()
  }

  const createMutation = useOptimisticCreate<BankAccountRow, FormValues>({
    mutationFn: (values) => bankAccountsApi.create(values),
    queryKeyPrefixes: [qk.bankAccounts.all],
    createPlaceholder: (values) => ({
      id: -Date.now(),
      code: values.code,
      name: values.name,
      account_type: values.account_type,
      bank_name: values.bank_name,
      branch: values.branch,
      account_number: values.account_number,
      currency: values.currency,
      gl_account: values.gl_account,
      gl_account_code: '',
      book_balance: '0.00',
      bank_balance: '0.00',
      is_default: values.is_default,
      is_active: true,
      last_reconciled_date: null,
      last_reconciled_balance: null,
    }),
    successMessage: 'Bank account created',
    errorMessage: 'Failed to save bank account',
    closeModal,
  })

  const updateMutation = useOptimisticUpdate<BankAccountRow, FormValues & { id: number }>({
    mutationFn: ({ id, ...values }) => bankAccountsApi.update(id, values),
    queryKeyPrefixes: [qk.bankAccounts.all],
    successMessage: 'Bank account updated',
    errorMessage: 'Failed to save bank account',
    closeModal,
  })

  const mutation = {
    mutate: (values: FormValues) =>
      account
        ? updateMutation.mutate({ ...values, id: account.id } as FormValues & { id: number })
        : createMutation.mutate(values),
    isPending: createMutation.isPending || updateMutation.isPending,
  }

  return (
    <Modal open={open} onClose={onClose} title={account ? `Edit ${account.code}` : 'New Bank Account'} icon={Bank}>
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
        <FormRow>
          <Input label="Code" placeholder="e.g. FNB-USD" error={errors.code?.message} {...register('code')} />
          <Input label="Name" error={errors.name?.message} {...register('name')} />
        </FormRow>
        <FormRow>
          <Select label="Account type" error={errors.account_type?.message} {...register('account_type')}>
            <option value="bank">Bank</option>
            <option value="mobile_money">Mobile Money</option>
            <option value="cash">Cash</option>
          </Select>
          <Select label="Currency" error={errors.currency?.message} {...register('currency')}>
            <option value="USD">USD</option>
            <option value="ZWG">ZWG</option>
          </Select>
        </FormRow>
        <FormRow>
          <Input label="Bank name" placeholder="e.g. First Capital" error={errors.bank_name?.message} {...register('bank_name')} />
          <Input label="Branch" error={errors.branch?.message} {...register('branch')} />
        </FormRow>
        <Input label="Account number" error={errors.account_number?.message} {...register('account_number')} />
        <Select label="GL account (cash/bank)" error={errors.gl_account?.message} {...register('gl_account')}>
          <option value={0}>Select account…</option>
          {cashAccounts.map((a) => (
            <option key={a.id} value={a.id}>{a.code} · {a.name} ({a.currency || 'multi'})</option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            {...register('is_default')}
          />
          Default account for its currency
        </label>
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={isSubmitting || mutation.isPending}>
            {account ? 'Save Changes' : 'Create Bank Account'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}

export default function BankAccounts() {
  const navigate = useNavigate()
  const [modalOpen, setModalOpen] = useState(false)
  const [editAccount, setEditAccount] = useState<BankAccountRow | null>(null)

  const { data: bankAccounts, isLoading } = useQuery({
    queryKey: qk.bankAccounts.list(),
    queryFn: () => bankAccountsApi.list().then((r) => r.data as BankAccountRow[]),
  })

  const columns: Column<BankAccountRow>[] = [
    { key: 'code', header: 'Code', render: (b) => <span className="font-mono text-primary-600 dark:text-primary-400">{b.code}</span> },
    { key: 'name', header: 'Name' },
    { key: 'account_type', header: 'Type', render: (b) => ACCOUNT_TYPE_LABELS[b.account_type] ?? b.account_type },
    { key: 'bank_name', header: 'Bank', render: (b) => b.bank_name || '—' },
    { key: 'currency', header: 'Ccy' },
    {
      key: 'book_balance',
      header: 'Book balance',
      align: 'right',
      render: (b) => <span className="tabular-nums">{money(b.book_balance)}</span>,
    },
    {
      key: 'bank_balance',
      header: 'Bank balance',
      align: 'right',
      render: (b) => <span className="tabular-nums">{money(b.bank_balance)}</span>,
    },
    {
      key: 'last_reconciled_date',
      header: 'Last reconciled',
      render: (b) => b.last_reconciled_date || '—',
    },
    {
      key: 'is_default',
      header: '',
      render: (b) => (b.is_default ? <Badge variant="info" size="sm">Default</Badge> : null),
    },
    {
      key: 'edit',
      header: '',
      align: 'right',
      render: (b) => (
        <button
          onClick={(e) => {
            e.stopPropagation()
            setEditAccount(b)
            setModalOpen(true)
          }}
          className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label={`Edit ${b.code}`}
        >
          <PencilSimple className="w-4 h-4" />
        </button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bank Accounts"
        description="Bank, mobile money and cash accounts with book vs bank balances"
        icon={Bank}
        actions={
          <Button onClick={() => { setEditAccount(null); setModalOpen(true) }}>
            <Plus className="w-4 h-4 mr-2" /> New Bank Account
          </Button>
        }
      />

      <DataTable<BankAccountRow>
        rowKey={(b) => b.id}
        columns={columns}
        data={bankAccounts ?? []}
        loading={isLoading}
        onRowClick={(b) => navigate(`/app/bank-accounts/${b.id}`)}
        emptyTitle="No bank accounts"
        emptyDescription="Create a bank account to record receipts and payments."
      />

      <BankAccountFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditAccount(null) }}
        account={editAccount}
      />
    </div>
  )
}
