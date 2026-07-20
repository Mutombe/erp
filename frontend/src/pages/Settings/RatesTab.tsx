import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowsLeftRight, Plus } from '@phosphor-icons/react'
import { exchangeRatesApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { showToast, parseApiError } from '@/lib/toast'
import {
  Badge,
  Button,
  DataTable,
  FormRow,
  Input,
  Modal,
  ModalFooter,
  RefreshingOverlay,
  Select,
  refreshingContentClass,
  type Column,
} from '@/components/ui'
import type { Paginated } from '@/types/accounting'

interface ExchangeRate {
  id: number
  from_currency: string
  to_currency: string
  rate: string
  effective_date: string
  source: string
  is_locked: boolean
  created_at: string
}

interface RateFormValues {
  from_currency: string
  to_currency: string
  rate: string
  effective_date: string
  source: string
}

function RateModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const { register, handleSubmit, formState: { errors } } = useForm<RateFormValues>({
    defaultValues: {
      from_currency: 'ZWG',
      to_currency: 'USD',
      effective_date: new Date().toISOString().slice(0, 10),
      source: '',
    },
  })

  const mutation = useMutation({
    mutationFn: (values: RateFormValues) => exchangeRatesApi.create(values),
    onSuccess: () => {
      showToast.success('Exchange rate added')
      queryClient.invalidateQueries({ queryKey: qk.exchangeRates.all })
      onClose()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to add rate')),
  })

  return (
    <Modal open onClose={onClose} title="New Exchange Rate" icon={ArrowsLeftRight}
      description="Documents pick the latest rate effective on or before their date.">
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
        <FormRow>
          <Select label="From" required {...register('from_currency')} defaultValue="ZWG">
            <option value="ZWG">ZWG</option>
            <option value="USD">USD</option>
          </Select>
          <Select label="To" required {...register('to_currency')} defaultValue="USD">
            <option value="USD">USD</option>
            <option value="ZWG">ZWG</option>
          </Select>
        </FormRow>
        <FormRow>
          <Input
            label="Rate"
            required
            placeholder="e.g. 0.027750"
            error={errors.rate?.message}
            {...register('rate', {
              required: 'Rate is required',
              pattern: { value: /^\d+(\.\d{1,6})?$/, message: 'Up to 6 decimal places' },
            })}
          />
          <Input label="Effective date" type="date" required error={errors.effective_date?.message}
            {...register('effective_date', { required: 'Required' })} />
        </FormRow>
        <Input label="Source" placeholder="e.g. RBZ mid-rate" {...register('source')} />
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={mutation.isPending}>Add Rate</Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}

export default function RatesTab() {
  const [page, setPage] = useState(1)
  const [showModal, setShowModal] = useState(false)

  const { data, isFetching } = useQuery({
    queryKey: qk.exchangeRates.list({ page }),
    queryFn: () => exchangeRatesApi.list({ page }).then((r) => r.data as Paginated<ExchangeRate>),
    placeholderData: keepPreviousData,
  })

  // Paging keeps the current rows rendered while the next page loads.
  const isRefreshing = isFetching && !!data

  const columns: Column<ExchangeRate>[] = [
    {
      key: 'pair',
      header: 'Pair',
      render: (r) => <span className="font-mono font-medium">{r.from_currency} → {r.to_currency}</span>,
    },
    {
      key: 'rate',
      header: 'Rate',
      align: 'right',
      render: (r) => <span className="tabular-nums">{Number(r.rate).toLocaleString(undefined, { minimumFractionDigits: 6 })}</span>,
    },
    { key: 'effective_date', header: 'Effective date' },
    { key: 'source', header: 'Source', render: (r) => r.source || '—' },
    {
      key: 'is_locked',
      header: 'Status',
      render: (r) => (
        <Badge variant={r.is_locked ? 'purple' : 'success'} dot>
          {r.is_locked ? 'Locked' : 'Open'}
        </Badge>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="relative">
        <RefreshingOverlay active={isRefreshing} />
        <div className={refreshingContentClass(isRefreshing)}>
          <DataTable<ExchangeRate>
            rowKey={(r) => r.id}
            columns={columns}
            data={data?.results ?? []}
            loading={!data}
            emptyTitle="No exchange rates yet"
            emptyDescription="Add a ZWG → USD rate so multi-currency documents can translate to base."
            actions={
              <Button onClick={() => setShowModal(true)}>
                <Plus className="w-4 h-4 mr-2" /> New Rate
              </Button>
            }
            pagination={{ page, pageSize: 25, total: data?.count ?? 0, onPageChange: setPage }}
          />
        </div>
      </div>

      {showModal && <RateModal onClose={() => setShowModal(false)} />}
    </div>
  )
}
