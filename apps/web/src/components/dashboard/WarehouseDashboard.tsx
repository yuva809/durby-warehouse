import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Package, Warehouse, Store, ClipboardList, AlertTriangle, Truck, ChevronRight } from 'lucide-react'
import { StatCard } from '../ui/StatCard'
import { Card, CardHeader } from '../ui/Card'
import { RequestStatusBadge, TransferStatusBadge } from '../ui/StatusBadge'
import { EmptyState } from '../ui/EmptyState'
import { InventoryHealthChart } from './InventoryHealthChart'
import { BranchStockChart } from './BranchStockChart'
import { RequestDrawer } from '../requests/RequestDrawer'
import { TransferDrawer } from '../transfers/TransferDrawer'
import { useProducts, useLocations } from '../../hooks/useCatalog'
import { useInventory } from '../../hooks/useInventory'
import { useRequests } from '../../hooks/useRequests'
import { useTransfers } from '../../hooks/useTransfers'
import { formatCurrency, formatDateTime, stockStatus } from '../../lib/utils'
import { WAREHOUSE_ID } from '../../types'

export function WarehouseDashboard() {
  const { data: products = [] } = useProducts()
  const { data: locations = [] } = useLocations()
  const { data: inventoryLines = [] } = useInventory() // all locations, manager/admin only
  const { data: requests = [] } = useRequests()
  const { data: transfers = [] } = useTransfers()
  const navigate = useNavigate()
  const [openRequest, setOpenRequest] = useState<string | null>(null)
  const [openTransfer, setOpenTransfer] = useState<string | null>(null)

  const branches = locations.filter((l) => l.type === 'BRANCH')

  const byLocationProduct = useMemo(() => {
    const map = new Map<string, number>()
    for (const line of inventoryLines) map.set(`${line.locationId}:${line.productId}`, line.onHand)
    return map
  }, [inventoryLines])

  const kpis = useMemo(() => {
    const warehouseValue = products.reduce((sum, p) => sum + (byLocationProduct.get(`${WAREHOUSE_ID}:${p.id}`) ?? 0) * p.unitPrice, 0)
    const pending = requests.filter((r) => r.status === 'PENDING' || r.status === 'REVIEWING').length
    let lowStock = 0
    for (const b of branches) {
      for (const p of products) {
        const status = stockStatus(byLocationProduct.get(`${b.id}:${p.id}`) ?? 0, p.minStock)
        if (status !== 'healthy') lowStock++
      }
    }
    const todaysDeliveries = transfers.filter((t) => t.status !== 'READY').length
    return { warehouseValue, pending, lowStock, todaysDeliveries }
  }, [products, byLocationProduct, requests, transfers, branches])

  const health = useMemo(() => {
    let healthy = 0, low = 0, out = 0
    for (const b of branches) {
      for (const p of products) {
        const status = stockStatus(byLocationProduct.get(`${b.id}:${p.id}`) ?? 0, p.minStock)
        if (status === 'healthy') healthy++
        else if (status === 'low') low++
        else out++
      }
    }
    return { healthy, low, out }
  }, [branches, products, byLocationProduct])

  const distribution = branches.map((b) => ({
    name: b.shortName ?? b.name,
    value: Math.round(products.reduce((sum, p) => sum + (byLocationProduct.get(`${b.id}:${p.id}`) ?? 0) * p.unitPrice, 0)),
  }))

  const pendingRequests = [...requests]
    .filter((r) => r.status === 'PENDING' || r.status === 'REVIEWING')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5)

  const todaysDeliveries = [...transfers]
    .filter((t) => t.status !== 'READY')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={<Package size={16} />} label="Total Products" value={products.length} tone="brand" />
        <StatCard icon={<Warehouse size={16} />} label="Warehouse Stock" value={formatCurrency(kpis.warehouseValue)} tone="brand" />
        <StatCard icon={<Store size={16} />} label="Branches" value={branches.length} />
        <StatCard icon={<ClipboardList size={16} />} label="Pending Requests" value={kpis.pending} tone={kpis.pending > 0 ? 'warning' : 'default'} />
        <StatCard icon={<AlertTriangle size={16} />} label="Low Stock" value={kpis.lowStock} tone={kpis.lowStock > 0 ? 'danger' : 'default'} />
        <StatCard icon={<Truck size={16} />} label="Today's Deliveries" value={kpis.todaysDeliveries} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Pending Stock Requests"
            subtitle="Awaiting warehouse review"
            action={
              <button onClick={() => navigate('/requests')} className="flex items-center gap-0.5 text-xs font-medium text-brand-600 hover:text-brand-700 cursor-pointer">
                View all <ChevronRight size={13} />
              </button>
            }
          />
          {pendingRequests.length === 0 ? (
            <EmptyState title="No pending requests" subtitle="All caught up — new branch requests will appear here." />
          ) : (
            <div className="divide-y divide-ink-50 border-t border-ink-100">
              {pendingRequests.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setOpenRequest(r.id)}
                  className="flex w-full items-center justify-between px-5 py-3.5 text-left hover:bg-brand-50/40 cursor-pointer"
                >
                  <div>
                    <div className="text-sm font-semibold text-ink-900">{r.code}</div>
                    <div className="text-xs text-ink-400">{r.branch?.name} · {r.items.length} products</div>
                  </div>
                  <RequestStatusBadge status={r.status} />
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Today's Deliveries"
            subtitle="Transfers in motion"
            action={
              <button onClick={() => navigate('/deliveries')} className="flex items-center gap-0.5 text-xs font-medium text-brand-600 hover:text-brand-700 cursor-pointer">
                View all <ChevronRight size={13} />
              </button>
            }
          />
          {todaysDeliveries.length === 0 ? (
            <EmptyState title="No deliveries yet" subtitle="Approved transfers will show up here." />
          ) : (
            <div className="divide-y divide-ink-50 border-t border-ink-100">
              {todaysDeliveries.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setOpenTransfer(t.id)}
                  className="flex w-full items-center justify-between px-5 py-3.5 text-left hover:bg-brand-50/40 cursor-pointer"
                >
                  <div>
                    <div className="text-sm font-semibold text-ink-900">{t.branch?.name}</div>
                    <div className="text-xs text-ink-400">{t.code} · {formatDateTime(t.createdAt)}</div>
                  </div>
                  <TransferStatusBadge status={t.status} />
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <CardHeader className="p-0 pb-4" title="Inventory Health" subtitle="Across all branches" />
          <InventoryHealthChart {...health} />
        </Card>
        <Card className="p-5">
          <CardHeader className="p-0 pb-4" title="Stock Distribution" subtitle="Value held per branch" />
          <BranchStockChart data={distribution} />
        </Card>
      </div>

      <RequestDrawer requestId={openRequest} onClose={() => setOpenRequest(null)} onViewTransfer={setOpenTransfer} />
      <TransferDrawer transferId={openTransfer} onClose={() => setOpenTransfer(null)} />
    </div>
  )
}
