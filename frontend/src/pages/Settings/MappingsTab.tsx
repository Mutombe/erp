import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, PencilSimple, Plus } from '@phosphor-icons/react'
import { accountsApi, mappingsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { showToast, parseApiError } from '@/lib/toast'
import {
  Button,
  DataTable,
  FormRow,
  Modal,
  ModalFooter,
  RefreshingOverlay,
  Select,
  refreshingContentClass,
  type Column,
} from '@/components/ui'
import type { Account } from '@/types/accounting'

interface Mapping {
  id: number
  purpose: string
  currency: string
  account: number
  account_code: string
  account_name: string
}

// Mirrors backend MAPPING_PURPOSES
export const MAPPING_PURPOSES: [string, string][] = [
  ['ar_control', 'Accounts receivable control'],
  ['ap_control', 'Accounts payable control'],
  ['deferred_fee_income', 'Deferred fee income'],
  ['grni', 'Goods received not invoiced'],
  ['inventory_adjustment', 'Inventory adjustment'],
  ['bursary_contra', 'Bursaries / scholarships contra'],
  ['fx_gain_realized', 'Realized FX gain'],
  ['fx_loss_realized', 'Realized FX loss'],
  ['fx_gain_unrealized', 'Unrealized FX gain'],
  ['fx_loss_unrealized', 'Unrealized FX loss'],
  ['gain_on_disposal', 'Gain on asset disposal'],
  ['loss_on_disposal', 'Loss on asset disposal'],
  ['opening_balances', 'Opening balances contra'],
  ['accumulated_fund', 'Accumulated fund'],
  ['vat_payable', 'VAT payable'],
  ['rounding', 'Rounding differences'],
]

const purposeLabel = (purpose: string) =>
  MAPPING_PURPOSES.find(([value]) => value === purpose)?.[1] ?? purpose

interface MappingFormValues {
  purpose: string
  currency: string
  account: string
}

function MappingModal({ mapping, onClose }: { mapping: Mapping | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { register, handleSubmit, formState: { errors } } = useForm<MappingFormValues>({
    defaultValues: {
      purpose: mapping?.purpose ?? '',
      currency: mapping?.currency ?? '',
      account: mapping ? String(mapping.account) : '',
    },
  })

  const { data: accounts } = useQuery({
    queryKey: qk.accounts.list(),
    queryFn: () => accountsApi.list().then((r) => r.data as Account[]),
  })

  const mutation = useMutation({
    mutationFn: (values: MappingFormValues) => {
      const payload = {
        purpose: values.purpose,
        currency: values.currency,
        account: Number(values.account),
      }
      return mapping ? mappingsApi.update(mapping.id, payload) : mappingsApi.create(payload)
    },
    onSuccess: () => {
      showToast.success(mapping ? 'Mapping updated' : 'Mapping created')
      queryClient.invalidateQueries({ queryKey: qk.mappings.all })
      onClose()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to save mapping')),
  })

  return (
    <Modal open onClose={onClose} title={mapping ? 'Edit Account Mapping' : 'New Account Mapping'} icon={Link}
      description="The posting engine resolves accounts by purpose — never by hard-coded code.">
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
        <FormRow>
          <Select
            label="Purpose"
            required
            placeholder="Select purpose…"
            disabled={!!mapping}
            error={errors.purpose?.message}
            defaultValue={mapping?.purpose ?? ''}
            options={MAPPING_PURPOSES.map(([value, label]) => ({ value, label }))}
            {...register('purpose', { required: 'Purpose is required' })}
          />
          <Select label="Currency" {...register('currency')} defaultValue={mapping?.currency ?? ''}>
            <option value="">Any currency</option>
            <option value="USD">USD</option>
            <option value="ZWG">ZWG</option>
          </Select>
        </FormRow>
        <Select
          label="Account"
          required
          searchable
          placeholder="Select account…"
          error={errors.account?.message}
          defaultValue={mapping ? String(mapping.account) : ''}
          options={(accounts ?? []).map((a) => ({ value: String(a.id), label: `${a.code} · ${a.name}` }))}
          {...register('account', { required: 'Account is required' })}
        />
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={mutation.isPending}>{mapping ? 'Save Changes' : 'Create Mapping'}</Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}

export default function MappingsTab() {
  // undefined = closed, null = create, Mapping = edit
  const [modalMapping, setModalMapping] = useState<Mapping | null | undefined>(undefined)

  const { data, isFetching } = useQuery({
    queryKey: qk.mappings.list(),
    queryFn: () => mappingsApi.list().then((r) => r.data as Mapping[]),
  })

  // Refetches after a save refresh the rows in place instead of blanking the table.
  const isRefreshing = isFetching && !!data

  const columns: Column<Mapping>[] = [
    { key: 'purpose', header: 'Purpose', render: (m) => <span className="font-medium">{purposeLabel(m.purpose)}</span> },
    { key: 'currency', header: 'Currency', render: (m) => m.currency || <span className="text-gray-400">Any</span> },
    {
      key: 'account',
      header: 'Account',
      render: (m) => (
        <span>
          <span className="font-mono text-xs mr-2 text-primary-600 dark:text-primary-400">{m.account_code}</span>
          {m.account_name}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (m) => (
        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setModalMapping(m) }}>
          <PencilSimple className="w-3.5 h-3.5 mr-1.5" /> Edit
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="relative">
        <RefreshingOverlay active={isRefreshing} />
        <div className={refreshingContentClass(isRefreshing)}>
          <DataTable<Mapping>
            rowKey={(m) => m.id}
            columns={columns}
            data={data ?? []}
            loading={!data}
            emptyTitle="No account mappings"
            emptyDescription="Posting will fail for purposes without a mapping — configure them here."
            actions={
              <Button onClick={() => setModalMapping(null)}>
                <Plus className="w-4 h-4 mr-2" /> New Mapping
              </Button>
            }
          />
        </div>
      </div>

      {modalMapping !== undefined && (
        <MappingModal mapping={modalMapping} onClose={() => setModalMapping(undefined)} />
      )}
    </div>
  )
}
