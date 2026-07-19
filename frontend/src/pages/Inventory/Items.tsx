import { useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { FolderPlus, Package, Pencil, Plus } from 'lucide-react'
import { accountsApi, itemCategoriesApi, itemsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import { useDebounce } from '@/lib/utils'
import { showToast, parseApiError } from '@/lib/toast'
import {
  Badge,
  Button,
  DataTable,
  Input,
  Modal,
  ModalFooter,
  PageHeader,
  Select,
  type Column,
} from '@/components/ui'
import type { Account, Paginated } from '@/types/accounting'
import { isLowStock, type Item } from '@/types/inventory'
import { money } from '@/types/procurement'
import ItemFormModal from './ItemFormModal'

const categorySchema = z.object({
  name: z.string().min(2, 'Name is required'),
  inventory_account: z.coerce.number().min(1, 'Inventory account is required'),
  consumption_expense_account: z.coerce.number().min(1, 'Expense account is required'),
})

type CategoryValues = z.infer<typeof categorySchema>

function CategoryFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()

  const { data: accounts } = useQuery({
    queryKey: qk.accounts.list({ is_active: true }),
    queryFn: () => accountsApi.list({ is_active: true }).then((r) => r.data as Account[]),
  })

  const inventoryAccounts = (accounts ?? []).filter((a) => a.code.startsWith('12'))
  const expenseAccounts = (accounts ?? []).filter((a) => a.account_type === 'expense')

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CategoryValues>({ resolver: zodResolver(categorySchema) })

  const mutation = useMutation({
    mutationFn: (values: CategoryValues) => itemCategoriesApi.create(values),
    onSuccess: () => {
      showToast.success('Category created')
      queryClient.invalidateQueries({ queryKey: qk.itemCategories.all })
      reset()
      onClose()
    },
    onError: (error) => showToast.error(parseApiError(error, 'Failed to create category')),
  })

  return (
    <Modal open={open} onClose={onClose} title="New Item Category">
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
        <Input label="Name" error={errors.name?.message} {...register('name')} />
        <Select
          label="Inventory account (balance sheet)"
          error={errors.inventory_account?.message}
          {...register('inventory_account')}
        >
          <option value={0}>Select account…</option>
          {inventoryAccounts.map((a) => (
            <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
          ))}
        </Select>
        <Select
          label="Consumption expense account"
          error={errors.consumption_expense_account?.message}
          {...register('consumption_expense_account')}
        >
          <option value={0}>Select account…</option>
          {expenseAccounts.map((a) => (
            <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
          ))}
        </Select>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Receipts debit the inventory account; issues credit it and debit the consumption expense.
        </p>
        <ModalFooter>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={isSubmitting || mutation.isPending}>Create Category</Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}

export default function Items() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [itemModalOpen, setItemModalOpen] = useState(false)
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [editItem, setEditItem] = useState<Item | null>(null)
  const debouncedSearch = useDebounce(search, 300)

  const { data, isLoading } = useQuery({
    queryKey: qk.items.list({ page, search: debouncedSearch }),
    queryFn: () =>
      itemsApi
        .list({ page, search: debouncedSearch || undefined })
        .then((r) => r.data as Paginated<Item>),
    placeholderData: keepPreviousData,
  })

  const columns: Column<Item>[] = [
    { key: 'code', header: 'Code', render: (i) => <span className="font-mono text-primary-600 dark:text-primary-400">{i.code}</span> },
    { key: 'name', header: 'Name' },
    { key: 'category_name', header: 'Category', render: (i) => i.category_name || '—' },
    { key: 'uom', header: 'UoM' },
    {
      key: 'qty_on_hand',
      header: 'On hand',
      align: 'right',
      render: (i) => (
        <span className="inline-flex items-center gap-2">
          {isLowStock(i) && <Badge variant="danger" size="sm">Low</Badge>}
          <span className="tabular-nums">{money(i.qty_on_hand)}</span>
        </span>
      ),
    },
    {
      key: 'avg_cost',
      header: 'Avg cost',
      align: 'right',
      render: (i) => <span className="tabular-nums">{money(i.avg_cost)}</span>,
    },
    {
      key: 'value',
      header: 'Stock value',
      align: 'right',
      render: (i) => (
        <span className="tabular-nums">{money(parseFloat(i.qty_on_hand) * parseFloat(i.avg_cost))}</span>
      ),
    },
    {
      key: 'edit',
      header: '',
      align: 'right',
      render: (i) => (
        <button
          onClick={(e) => {
            e.stopPropagation()
            setEditItem(i)
            setItemModalOpen(true)
          }}
          className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label={`Edit ${i.code}`}
        >
          <Pencil className="w-4 h-4" />
        </button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Items"
        description="Stock items, consumables and services with moving-average costs"
        icon={Package}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setCategoryModalOpen(true)}>
              <FolderPlus className="w-4 h-4 mr-2" /> New Category
            </Button>
            <Button onClick={() => { setEditItem(null); setItemModalOpen(true) }}>
              <Plus className="w-4 h-4 mr-2" /> New Item
            </Button>
          </div>
        }
      />

      <DataTable<Item>
        rowKey={(i) => i.id}
        columns={columns}
        data={data?.results ?? []}
        loading={isLoading}
        searchable
        searchValue={search}
        onSearch={(q) => { setSearch(q); setPage(1) }}
        searchPlaceholder="Search code, name, barcode…"
        onRowClick={(i) => navigate(`/app/items/${i.id}`)}
        emptyTitle="No items found"
        emptyDescription="Create your first inventory item to start tracking stock."
        pagination={{
          page,
          pageSize: 25,
          total: data?.count ?? 0,
          onPageChange: setPage,
        }}
      />

      <ItemFormModal
        open={itemModalOpen}
        onClose={() => { setItemModalOpen(false); setEditItem(null) }}
        item={editItem}
      />
      <CategoryFormModal open={categoryModalOpen} onClose={() => setCategoryModalOpen(false)} />
    </div>
  )
}
