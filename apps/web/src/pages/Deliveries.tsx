import { useMemo, useState } from 'react'
import { Truck, MapPin } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { TransferStatusBadge } from '../components/ui/StatusBadge'
import { EmptyState } from '../components/ui/EmptyState'
import { TransferDrawer } from '../components/transfers/TransferDrawer'
import { useTransfers } from '../hooks/useTransfers'
import { transferDocNumber } from '../lib/utils'
import type { TransferStatus } from '../types'

const PRIORITY: Record<TransferStatus, number> = {
  PICKING: 0,
  ASSIGNED: 1,
  OUT_FOR_DELIVERY: 2,
  FAILED: 3,
  READY: 4,
  PARTIALLY_DELIVERED: 5,
  DELIVERED: 6,
}

export default function Deliveries() {
  // No client-side branch/driver filter needed: the API already scopes
  // /transfers to "my branch" or "my assigned deliveries" server-side,
  // depending on the caller's role — a driver can never even fetch another
  // driver's transfer by guessing an ID (TransfersService.assertAccess).
  const { data: transfers = [] } = useTransfers()
  const [openTransfer, setOpenTransfer] = useState<string | null>(null)

  const list = useMemo(
    () => [...transfers].sort((a, b) => PRIORITY[a.status] - PRIORITY[b.status] || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [transfers],
  )

  return (
    <div className="space-y-5">
      {list.length === 0 ? (
        <Card>
          <EmptyState icon={<Truck size={22} />} title="No deliveries scheduled" />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((t) => (
            <button key={t.id} onClick={() => setOpenTransfer(t.id)} className="text-left">
              <Card className="h-full p-5 transition-all hover:-translate-y-0.5 hover:shadow-md hover:ring-brand-200 cursor-pointer">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-display text-[15px] font-bold text-ink-900">{transferDocNumber(t)}</div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-ink-400">
                      <MapPin size={11} /> {t.branch?.name}
                    </div>
                  </div>
                  <TransferStatusBadge status={t.status} />
                </div>

                <div className="mt-3.5 space-y-1">
                  {t.items.slice(0, 4).map((item) => (
                    <div key={item.productId} className="flex justify-between text-xs text-ink-500">
                      <span>{item.product?.name}</span>
                      <span className="font-medium text-ink-700 tabular-nums">{item.approvedQty} {item.product?.unit}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3">
                  <span className="text-xs text-ink-400">Driver</span>
                  <span className="text-xs font-semibold text-ink-700">{t.driver?.name ?? 'Unassigned'}</span>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}

      <TransferDrawer transferId={openTransfer} onClose={() => setOpenTransfer(null)} />
    </div>
  )
}
