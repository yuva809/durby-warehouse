import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Package, AlertTriangle, ClipboardList, Truck, ChevronRight } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { useProducts, useLocations } from '../hooks/useCatalog'
import { useInventory } from '../hooks/useInventory'
import { useRequests } from '../hooks/useRequests'
import { useTransfers } from '../hooks/useTransfers'
import { computeBranchStats } from '../lib/branchStats'
import { BRANCH_HEALTH_STYLES, formatCurrency } from '../lib/utils'

export default function Branches() {
  const { data: products = [] } = useProducts()
  const { data: locations = [] } = useLocations()
  const { data: inventoryLines = [] } = useInventory()
  const { data: requests = [] } = useRequests()
  const { data: transfers = [] } = useTransfers()
  const navigate = useNavigate()

  const branches = locations.filter((l) => l.type === 'BRANCH')

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {branches.map((b) => {
        const stats = computeBranchStats(b.id, products, inventoryLines, requests, transfers)
        const style = BRANCH_HEALTH_STYLES[stats.health]
        return (
          <button key={b.id} onClick={() => navigate(`/branches/${b.id}`)} className="text-left">
            <Card className="h-full p-5 transition-all hover:-translate-y-0.5 hover:shadow-md hover:ring-brand-200 cursor-pointer">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-display text-[17px] font-bold text-ink-900">{b.name}</div>
                  <div className="text-xs text-ink-400">{b.city ? `${b.city} · Retail location` : 'Retail location'}</div>
                </div>
                <Badge className={style.badge}>{style.label}</Badge>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <Stat icon={<Package size={13} />} label="Products" value={stats.productCount} />
                <Stat icon={<AlertTriangle size={13} />} label="Low Stock" value={stats.lowStockCount} warn={stats.lowStockCount > 0} />
                <Stat icon={<ClipboardList size={13} />} label="Pending Requests" value={stats.pendingRequests} />
                <Stat icon={<Truck size={13} />} label="Incoming" value={stats.incomingDeliveries} />
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3.5">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Stock Value</div>
                  <div className="font-display text-base font-bold text-ink-900">{formatCurrency(stats.stockValue)}</div>
                </div>
                <span className="flex items-center gap-1 text-xs font-medium text-brand-600">
                  View inventory <ChevronRight size={14} />
                </span>
              </div>
            </Card>
          </button>
        )
      })}
    </div>
  )
}

function Stat({ icon, label, value, warn }: { icon: ReactNode; label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-ink-50 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink-400">
        {icon} {label}
      </div>
      <div className={`mt-0.5 text-base font-bold tabular-nums ${warn ? 'text-amber-600' : 'text-ink-800'}`}>{value}</div>
    </div>
  )
}
