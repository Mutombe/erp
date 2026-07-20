import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FileText, Plus, ShoppingCart, Truck, Wallet } from '@phosphor-icons/react'
import { purchaseOrdersApi, suppliersApi, supplierPaymentsApi, vendorBillsApi } from '@/services/api'
import { qk } from '@/lib/queryKeys'
import {
  Badge,
  Button,
  DataTable,
  PageHeader,
  RefreshingOverlay,
  SkeletonCard,
  StatusBadge,
  refreshingContentClass,
  type Column,
} from '@/components/ui'
import type { Paginated } from '@/types/accounting'
import { money, type PurchaseOrder, type Supplier, type SupplierPayment, type VendorBill } from '@/types/procurement'
import { PoStatusBadge } from './PurchaseOrders'

export default function SupplierDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [poPage, setPoPage] = useState(1)
  const [billPage, setBillPage] = useState(1)
  const [paymentPage, setPaymentPage] = useState(1)

  const { data: supplier } = useQuery({
    queryKey: qk.suppliers.detail(id!),
    queryFn: () => suppliersApi.get(id!).then((r) => r.data as Supplier),
  })

  const { data: pos, isFetching: posFetching } = useQuery({
    queryKey: qk.purchaseOrders.list({ supplier: id, page: poPage }),
    queryFn: () =>
      purchaseOrdersApi.list({ supplier: id, page: poPage }).then((r) => r.data as Paginated<PurchaseOrder>),
    enabled: !!id,
    placeholderData: keepPreviousData,
  })
  const posRefreshing = posFetching && !!pos

  const { data: bills, isFetching: billsFetching } = useQuery({
    queryKey: qk.vendorBills.list({ supplier: id, page: billPage }),
    queryFn: () =>
      vendorBillsApi.list({ supplier: id, page: billPage }).then((r) => r.data as Paginated<VendorBill>),
    enabled: !!id,
    placeholderData: keepPreviousData,
  })
  const billsRefreshing = billsFetching && !!bills

  const { data: payments, isFetching: paymentsFetching } = useQuery({
    queryKey: qk.supplierPayments.list({ supplier: id, page: paymentPage }),
    queryFn: () =>
      supplierPaymentsApi
        .list({ supplier: id, page: paymentPage })
        .then((r) => r.data as Paginated<SupplierPayment>),
    enabled: !!id,
    placeholderData: keepPreviousData,
  })
  const paymentsRefreshing = paymentsFetching && !!payments

  const poColumns: Column<PurchaseOrder>[] = [
    { key: 'number', header: 'Number', render: (po) => <span className="font-mono text-primary-600 dark:text-primary-400">{po.number}</span> },
    { key: 'date', header: 'Date' },
    { key: 'currency', header: 'Ccy' },
    { key: 'total', header: 'Total', align: 'right', render: (po) => <span className="tabular-nums">{money(po.total)}</span> },
    { key: 'status', header: 'Status', render: (po) => <PoStatusBadge status={po.status} /> },
  ]

  const billColumns: Column<VendorBill>[] = [
    { key: 'number', header: 'Number', render: (b) => <span className="font-mono text-primary-600 dark:text-primary-400">{b.number}</span> },
    { key: 'supplier_reference', header: 'Supplier ref', render: (b) => b.supplier_reference || '—' },
    { key: 'date', header: 'Date' },
    { key: 'due_date', header: 'Due' },
    { key: 'total', header: 'Total', align: 'right', render: (b) => <span className="tabular-nums">{money(b.total)}</span> },
    { key: 'balance', header: 'Balance', align: 'right', render: (b) => <span className="tabular-nums">{money(b.balance)}</span> },
    { key: 'status', header: 'Status', render: (b) => <StatusBadge status={b.status} /> },
  ]

  const paymentColumns: Column<SupplierPayment>[] = [
    { key: 'number', header: 'Number', render: (p) => <span className="font-mono text-primary-600 dark:text-primary-400">{p.number}</span> },
    { key: 'date', header: 'Date' },
    { key: 'reference', header: 'Reference', render: (p) => p.reference || '—' },
    { key: 'currency', header: 'Ccy' },
    { key: 'amount', header: 'Amount', align: 'right', render: (p) => <span className="tabular-nums">{money(p.amount)}</span> },
    { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
  ]

  if (!supplier) return <SkeletonCard />

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${supplier.code} · ${supplier.name}`}
        description={`Payment terms ${supplier.payment_terms_days} days · ${supplier.default_currency}`}
        icon={Truck}
        backLink="/app/suppliers"
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={supplier.is_active ? 'success' : 'default'} dot>
              {supplier.is_active ? 'Active' : 'Inactive'}
            </Badge>
            <Button onClick={() => navigate('/app/purchase-orders/new')}>
              <Plus className="w-4 h-4 mr-2" /> New PO
            </Button>
          </div>
        }
      />

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div><span className="text-gray-500 block">Contact</span>{supplier.contact_person || '—'}</div>
        <div><span className="text-gray-500 block">Phone</span>{supplier.phone || '—'}</div>
        <div><span className="text-gray-500 block">Email</span>{supplier.email || '—'}</div>
        <div><span className="text-gray-500 block">Tax number</span>{supplier.tax_number || '—'}</div>
        {supplier.address && (
          <div className="col-span-2 md:col-span-4">
            <span className="text-gray-500 block">Address</span>{supplier.address}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
          <ShoppingCart className="w-4 h-4" /> Purchase Orders
        </h3>
        <div className="relative">
          <RefreshingOverlay active={posRefreshing} />
          <div className={refreshingContentClass(posRefreshing)}>
            <DataTable<PurchaseOrder>
              rowKey={(po) => po.id}
              columns={poColumns}
              data={pos?.results ?? []}
              loading={!pos}
              onRowClick={(po) => navigate(`/app/purchase-orders/${po.id}`)}
              emptyTitle="No purchase orders"
              pagination={{ page: poPage, pageSize: 25, total: pos?.count ?? 0, onPageChange: setPoPage }}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
          <FileText className="w-4 h-4" /> Vendor Bills
        </h3>
        <div className="relative">
          <RefreshingOverlay active={billsRefreshing} />
          <div className={refreshingContentClass(billsRefreshing)}>
            <DataTable<VendorBill>
              rowKey={(b) => b.id}
              columns={billColumns}
              data={bills?.results ?? []}
              loading={!bills}
              onRowClick={(b) => navigate(`/app/vendor-bills/${b.id}`)}
              emptyTitle="No bills"
              pagination={{ page: billPage, pageSize: 25, total: bills?.count ?? 0, onPageChange: setBillPage }}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
          <Wallet className="w-4 h-4" /> Payments
        </h3>
        <div className="relative">
          <RefreshingOverlay active={paymentsRefreshing} />
          <div className={refreshingContentClass(paymentsRefreshing)}>
            <DataTable<SupplierPayment>
              rowKey={(p) => p.id}
              columns={paymentColumns}
              data={payments?.results ?? []}
              loading={!payments}
              onRowClick={(p) => navigate(`/app/supplier-payments/${p.id}`)}
              emptyTitle="No payments"
              pagination={{ page: paymentPage, pageSize: 25, total: payments?.count ?? 0, onPageChange: setPaymentPage }}
            />
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        <Link to="/app/supplier-payments" className="hover:underline text-primary-600 dark:text-primary-400">
          View all supplier payments →
        </Link>
      </p>
    </div>
  )
}
