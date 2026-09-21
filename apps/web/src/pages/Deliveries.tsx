import { useMemo, useState } from 'react'
import { Truck, MapPin } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { TransferStatusBadge } from '../components/ui/StatusBadge'
import { EmptyState } from '../components/ui/EmptyState'
import { TransferDrawer } from '../components/transfers/TransferDrawer'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { branchIdForRole } from '../lib/viewRoles'
import type { TransferStatus } from '../types'

const PRIORITY: Record<TransferStatus, number> = { picking: 0, assigned: 1, out_for_delivery: 2, ready: 3, delivered: 4 }

export default function Deliveries() {
  const view = useWarehouseStore((s) => s.view)
  const transfers = useWarehouseStore((s) => s.transfers)
  const locations = useWarehouseStore((s) => s.locations)
  const drivers = useWarehouseStore((s) => s.drivers)
  const products = useWarehouseStore((s) => s.products)
  const [openTransfer, setOpenTransfer] = useState<string | null>(null)

  const branchId = branchIdForRole(view)

  const list = useMemo(() => {
    let base = transfers
    if (branchId) base = base.filter((t) => t.branchId === branchId)
    return [...base].sort((a, b) => PRIORITY[a.status] - PRIORITY[b.status] || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [transfers, branchId])

  return (
    <div className="space-y-5">
      {list.length === 0 ? (
        <Card>
          <EmptyState icon={<Truck size={22} />} title="No deliveries scheduled" />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((t) => {
            const branch = locations.find((l) => l.id === t.branchId)
            const driver = drivers.find((d) => d.id === t.driverId)
            return (
              <button key={t.id} onClick={() => setOpenTransfer(t.id)} className="text-left">
                <Card className="h-full p-5 transition-all hover:-translate-y-0.5 hover:shadow-md hover:ring-brand-200 cursor-pointer">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-display text-[15px] font-bold text-ink-900">{t.id}</div>
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-ink-400">
                        <MapPin size={11} /> {branch?.name}
                      </div>
                    </div>
                    <TransferStatusBadge status={t.status} />
                  </div>

                  <div className="mt-3.5 space-y-1">
                    {t.items.slice(0, 4).map((item) => {
                      const product = products.find((p) => p.id === item.productId)
                      return (
                        <div key={item.productId} className="flex justify-between text-xs text-ink-500">
                          <span>{product?.name}</span>
                          <span className="font-medium text-ink-700 tabular-nums">{item.qty} {product?.unit}</span>
                        </div>
                      )
                    })}
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3">
                    <span className="text-xs text-ink-400">Driver</span>
                    <span className="text-xs font-semibold text-ink-700">{driver?.name ?? 'Unassigned'}</span>
                  </div>
                </Card>
              </button>
            )
          })}
        </div>
      )}

      <TransferDrawer transferId={openTransfer} onClose={() => setOpenTransfer(null)} />
    </div>
  )
}
