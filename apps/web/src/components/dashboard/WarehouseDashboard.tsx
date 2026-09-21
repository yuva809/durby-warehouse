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
import { useWarehouseStore } from '../../store/useWarehouseStore'
import { computeBranchStats } from '../../lib/branchStats'
import { inventoryService } from '../../services/inventoryService'
import { formatCurrency, formatDateTime, stockStatus } from '../../lib/utils'
import { BRANCH_IDS } from '../../types'

export function WarehouseDashboard() {
  const products = useWarehouseStore((s) => s.products)
  const locations = useWarehouseStore((s) => s.locations)
  const inventory = useWarehouseStore((s) => s.inventory)
  const requests = useWarehouseStore((s) => s.requests)
  const transfers = useWarehouseStore((s) => s.transfers)
  const navigate = useNavigate()
  const [openRequest, setOpenRequest] = useState<string | null>(null)
  const [openTransfer, setOpenTransfer] = useState<string | null>(null)

  const branches = locations.filter((l) => BRANCH_IDS.includes(l.id as (typeof BRANCH_IDS)[number]))

  const kpis = useMemo(() => {
    const warehouseValue = inventoryService.getWarehouseValue()
    const pending = requests.filter((r) => r.status === 'pending' || r.status === 'reviewing').length
    let lowStock = 0
    for (const b of branches) lowStock += computeBranchStats(b.id, products, inventory, requests, transfers).lowStockCount
    const todaysDeliveries = transfers.filter((t) => t.status !== 'ready').length
    return { warehouseValue, pending, lowStock, todaysDeliveries }
  }, [products, inventory, requests, transfers, branches])

  const health = useMemo(() => {
    let healthy = 0,
      low = 0,
      out = 0
    for (const b of branches) {
      for (const p of products) {
        const status = stockStatus(inventory[b.id]?.[p.id] ?? 0, p.minStock)
        if (status === 'healthy') healthy++
        else if (status === 'low') low++
        else out++
      }
    }
    return { healthy, low, out }
  }, [branches, products, inventory])

  const distribution = branches.map((b) => ({
    name: b.shortName ?? b.name,
    value: Math.round(products.reduce((sum, p) => sum + (inventory[b.id]?.[p.id] ?? 0) * p.unitPrice, 0)),
  }))

  const pendingRequests = [...requests]
    .filter((r) => r.status === 'pending' || r.status === 'reviewing')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5)

  const todaysDeliveries = [...transfers]
    .filter((t) => t.status !== 'ready')
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
              {pendingRequests.map((r) => {
                const branch = locations.find((l) => l.id === r.branchId)
                return (
                  <button
                    key={r.id}
                    onClick={() => setOpenRequest(r.id)}
                    className="flex w-full items-center justify-between px-5 py-3.5 text-left hover:bg-brand-50/40 cursor-pointer"
                  >
                    <div>
                      <div className="text-sm font-semibold text-ink-900">{r.id}</div>
                      <div className="text-xs text-ink-400">{branch?.name} · {r.items.length} products</div>
                    </div>
                    <RequestStatusBadge status={r.status} />
                  </button>
                )
              })}
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
              {todaysDeliveries.map((t) => {
                const branch = locations.find((l) => l.id === t.branchId)
                return (
                  <button
                    key={t.id}
                    onClick={() => setOpenTransfer(t.id)}
                    className="flex w-full items-center justify-between px-5 py-3.5 text-left hover:bg-brand-50/40 cursor-pointer"
                  >
                    <div>
                      <div className="text-sm font-semibold text-ink-900">{branch?.name}</div>
                      <div className="text-xs text-ink-400">{t.id} · {formatDateTime(t.createdAt)}</div>
                    </div>
                    <TransferStatusBadge status={t.status} />
                  </button>
                )
              })}
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
