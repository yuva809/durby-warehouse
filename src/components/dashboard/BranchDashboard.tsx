import { useMemo, useState } from 'react'
import { Plus, ClipboardList, Truck } from 'lucide-react'
import { Card, CardHeader } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { RequestStatusBadge, TransferStatusBadge } from '../ui/StatusBadge'
import { EmptyState } from '../ui/EmptyState'
import { FlashValue } from './FlashValue'
import { ProductDrawer } from '../inventory/ProductDrawer'
import { RequestDrawer } from '../requests/RequestDrawer'
import { RequestStockDrawer } from '../requests/RequestStockDrawer'
import { TransferDrawer } from '../transfers/TransferDrawer'
import { useWarehouseStore } from '../../store/useWarehouseStore'
import { STATUS_STYLES, cn, formatDateTime, stockStatus } from '../../lib/utils'

export function BranchDashboard({ branchId }: { branchId: string }) {
  const products = useWarehouseStore((s) => s.products)
  const locations = useWarehouseStore((s) => s.locations)
  const inventory = useWarehouseStore((s) => s.inventory)
  const requests = useWarehouseStore((s) => s.requests)
  const transfers = useWarehouseStore((s) => s.transfers)

  const [requestOpen, setRequestOpen] = useState(false)
  const [openProduct, setOpenProduct] = useState<string | null>(null)
  const [openRequest, setOpenRequest] = useState<string | null>(null)
  const [openTransfer, setOpenTransfer] = useState<string | null>(null)

  const branch = locations.find((l) => l.id === branchId)

  const inventoryRows = useMemo(() => {
    return products
      .map((p) => ({ product: p, qty: inventory[branchId]?.[p.id] ?? 0, status: stockStatus(inventory[branchId]?.[p.id] ?? 0, p.minStock) }))
      .sort((a, b) => {
        const rank = { out: 0, low: 1, healthy: 2 }
        return rank[a.status] - rank[b.status]
      })
  }, [products, inventory, branchId])

  const branchRequests = [...requests].filter((r) => r.branchId === branchId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const incoming = transfers.filter((t) => t.branchId === branchId && t.status !== 'delivered')

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-br from-ink-950 to-ink-800 px-6 py-5 text-white">
        <div>
          <div className="text-xs font-medium text-ink-300">{branch?.name}</div>
          <h2 className="font-display text-2xl font-bold">My Inventory</h2>
        </div>
        <Button variant="light" size="lg" onClick={() => setRequestOpen(true)}>
          <Plus size={17} /> Request Stock
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {inventoryRows.map(({ product, qty, status }) => {
          const style = STATUS_STYLES[status]
          return (
            <button key={product.id} onClick={() => setOpenProduct(product.id)} className="text-left">
              <Card
                className={cn(
                  'p-3.5 transition-all hover:-translate-y-0.5 hover:shadow-md cursor-pointer',
                  status !== 'healthy' && 'ring-1 ring-inset ' + (status === 'out' ? 'ring-rose-200' : 'ring-amber-200'),
                )}
              >
                <div className="truncate text-sm font-medium text-ink-800">{product.name}</div>
                <FlashValue
                  value={qty}
                  className="mt-1 block font-display text-lg font-bold tabular-nums text-ink-900"
                  render={(v) => `${v} ${product.unit}`}
                />
                <Badge className={cn('mt-2', style.badge)} dot={style.dot}>
                  {style.label}
                </Badge>
              </Card>
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Request History" subtitle="Your recent stock requests" />
          {branchRequests.length === 0 ? (
            <EmptyState icon={<ClipboardList size={20} />} title="No requests yet" subtitle="Tap Request Stock to send your first order to the warehouse." />
          ) : (
            <div className="divide-y divide-ink-50 border-t border-ink-100">
              {branchRequests.slice(0, 6).map((r) => (
                <button
                  key={r.id}
                  onClick={() => setOpenRequest(r.id)}
                  className="flex w-full items-center justify-between px-5 py-3.5 text-left hover:bg-brand-50/40 cursor-pointer"
                >
                  <div>
                    <div className="text-sm font-semibold text-ink-900">{r.id}</div>
                    <div className="text-xs text-ink-400">{r.items.length} products · {formatDateTime(r.createdAt)}</div>
                  </div>
                  <RequestStatusBadge status={r.status} />
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Incoming Deliveries" subtitle="On their way to you" />
          {incoming.length === 0 ? (
            <EmptyState icon={<Truck size={20} />} title="Nothing incoming" subtitle="Approved requests will appear here as transfers." />
          ) : (
            <div className="divide-y divide-ink-50 border-t border-ink-100">
              {incoming.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setOpenTransfer(t.id)}
                  className="flex w-full items-center justify-between px-5 py-3.5 text-left hover:bg-brand-50/40 cursor-pointer"
                >
                  <div>
                    <div className="text-sm font-semibold text-ink-900">{t.id}</div>
                    <div className="text-xs text-ink-400">{t.items.length} products</div>
                  </div>
                  <TransferStatusBadge status={t.status} />
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      <ProductDrawer productId={openProduct} onClose={() => setOpenProduct(null)} />
      <RequestDrawer requestId={openRequest} onClose={() => setOpenRequest(null)} onViewTransfer={setOpenTransfer} />
      <TransferDrawer transferId={openTransfer} onClose={() => setOpenTransfer(null)} />
      <RequestStockDrawer branchId={branchId} open={requestOpen} onClose={() => setRequestOpen(false)} />
    </div>
  )
}
