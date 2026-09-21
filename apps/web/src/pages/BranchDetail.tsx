import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { StatCard } from '../components/ui/StatCard'
import { RequestStatusBadge } from '../components/ui/StatusBadge'
import { ProductDrawer } from '../components/inventory/ProductDrawer'
import { RequestDrawer } from '../components/requests/RequestDrawer'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { computeBranchStats } from '../lib/branchStats'
import { BRANCH_HEALTH_STYLES, STATUS_STYLES, formatCurrency, formatDateTime, stockStatus } from '../lib/utils'
import { Package, AlertTriangle, ClipboardList, Truck } from 'lucide-react'

export default function BranchDetail() {
  const { branchId = '' } = useParams()
  const navigate = useNavigate()
  const products = useWarehouseStore((s) => s.products)
  const locations = useWarehouseStore((s) => s.locations)
  const inventory = useWarehouseStore((s) => s.inventory)
  const requests = useWarehouseStore((s) => s.requests)
  const transfers = useWarehouseStore((s) => s.transfers)
  const [params, setParams] = useSearchParams()
  const [openRequest, setOpenRequest] = useState<string | null>(null)

  const branch = locations.find((l) => l.id === branchId)
  if (!branch) return <EmptyBranch onBack={() => navigate('/branches')} />

  const stats = computeBranchStats(branchId, products, inventory, requests, transfers)
  const style = BRANCH_HEALTH_STYLES[stats.health]
  const branchRequests = requests.filter((r) => r.branchId === branchId).slice(0, 6)
  const openProduct = params.get('product')

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/branches')} className="flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800 cursor-pointer">
        <ArrowLeft size={15} /> Back to Branches
      </button>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-ink-900">{branch.name}</h2>
          <p className="text-sm text-ink-500">Supplied from Central Warehouse</p>
        </div>
        <Badge className={style.badge}>{style.label}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={<Package size={16} />} label="Products" value={stats.productCount} />
        <StatCard icon={<AlertTriangle size={16} />} label="Low Stock" value={stats.lowStockCount} tone={stats.lowStockCount > 0 ? 'warning' : 'default'} />
        <StatCard icon={<ClipboardList size={16} />} label="Pending Requests" value={stats.pendingRequests} />
        <StatCard icon={<Truck size={16} />} label="Incoming Deliveries" value={stats.incomingDeliveries} />
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-ink-100 px-5 py-4">
          <h3 className="font-display font-semibold text-ink-900">Inventory — {formatCurrency(stats.stockValue)} on hand</h3>
        </div>
        <div className="divide-y divide-ink-50">
          {products.map((p) => {
            const qty = inventory[branchId]?.[p.id] ?? 0
            const status = stockStatus(qty, p.minStock)
            const s = STATUS_STYLES[status]
            return (
              <button
                key={p.id}
                onClick={() => setParams({ product: p.id })}
                className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-brand-50/40 cursor-pointer"
              >
                <div>
                  <div className="text-sm font-medium text-ink-800">{p.name}</div>
                  <div className="text-xs text-ink-400">{p.sku} · min {p.minStock} {p.unit}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums text-ink-900">{qty} {p.unit}</span>
                  <Badge className={s.badge} dot={s.dot}>{s.label}</Badge>
                </div>
              </button>
            )
          })}
        </div>
      </Card>

      <Card>
        <div className="border-b border-ink-100 px-5 py-4">
          <h3 className="font-display font-semibold text-ink-900">Recent Requests</h3>
        </div>
        <div className="divide-y divide-ink-50">
          {branchRequests.map((r) => (
            <button
              key={r.id}
              onClick={() => setOpenRequest(r.id)}
              className="flex w-full items-center justify-between px-5 py-3.5 text-left hover:bg-brand-50/40 cursor-pointer"
            >
              <div>
                <div className="text-sm font-semibold text-ink-800">{r.id}</div>
                <div className="text-xs text-ink-400">{r.items.length} products · {formatDateTime(r.createdAt)}</div>
              </div>
              <RequestStatusBadge status={r.status} />
            </button>
          ))}
        </div>
      </Card>

      <ProductDrawer productId={openProduct} onClose={() => setParams({})} />
      <RequestDrawer requestId={openRequest} onClose={() => setOpenRequest(null)} />
    </div>
  )
}

function EmptyBranch({ onBack }: { onBack: () => void }) {
  return (
    <div className="py-20 text-center">
      <p className="text-ink-500">Branch not found.</p>
      <button onClick={onBack} className="mt-3 text-sm font-medium text-brand-600 cursor-pointer">
        Back to Branches
      </button>
    </div>
  )
}
