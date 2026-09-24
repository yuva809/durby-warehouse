import { useState } from 'react'
import { Drawer } from '../ui/Drawer'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { ProductFormDrawer } from './ProductFormDrawer'
import { ProductImagePanel } from './ProductImagePanel'
import { useProduct, useLocations } from '../../hooks/useCatalog'
import { useInventory } from '../../hooks/useInventory'
import { useActivity } from '../../hooks/useActivity'
import { useAuthStore } from '../../auth/authStore'
import { isManager } from '../../auth/roles'
import { STATUS_STYLES, formatCurrency, formatTime, stockStatus } from '../../lib/utils'
import { WAREHOUSE_ID } from '../../types'
import { Clock, CalendarClock, Pencil } from 'lucide-react'

function formatExpiry(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function ProductDrawer({ productId, onClose }: { productId: string | null; onClose: () => void }) {
  const user = useAuthStore((s) => s.user)
  const { data: product } = useProduct(productId)
  const { data: locations = [] } = useLocations()
  const { data: inventoryLines = [] } = useInventory()
  const { data: activity = [] } = useActivity()
  const [editOpen, setEditOpen] = useState(false)

  if (!product) return null

  const byLocation = new Map(inventoryLines.filter((l) => l.productId === product.id).map((l) => [l.locationId, l.onHand]))
  const totalQty = locations.reduce((sum, l) => sum + (byLocation.get(l.id) ?? 0), 0)
  const relatedActivity = activity.filter((a) => a.message.includes(product.name)).slice(0, 8)

  const daysToExpiry = product.expiryDate
    ? Math.ceil((new Date(product.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : undefined
  // 5-month near-expiry window — reasonable for slow-moving grocery stock, not just perishables
  const expiringSoon = daysToExpiry !== undefined && daysToExpiry <= 150

  return (
    <>
    <Drawer
      open={!!productId}
      onClose={onClose}
      title={product.name}
      subtitle={[product.brand, `Article No. ${product.sku}`].filter(Boolean).join(' · ')}
      footer={
        isManager(user) ? (
          <Button variant="outline" className="w-full" onClick={() => setEditOpen(true)}>
            <Pencil size={15} /> Edit Product
          </Button>
        ) : undefined
      }
    >
      <div className="mb-4">
        <ProductImagePanel productId={product.id} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { label: 'Article No.', value: product.sku },
          { label: 'Barcode', value: product.barcode ?? '—' },
          { label: 'Brand', value: product.brand ?? '—' },
          { label: 'Category', value: product.category },
          { label: 'Pack', value: product.pack ?? '—' },
          { label: 'Unit', value: product.unit },
          { label: 'Minimum Stock', value: `${product.minStock} ${product.unit}` },
        ].map((f) => (
          <div key={f.label} className="rounded-xl bg-ink-50 px-3 py-2.5">
            <div className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{f.label}</div>
            <div className="mt-0.5 text-sm font-semibold text-ink-800">{f.value}</div>
          </div>
        ))}
      </div>

      {product.expiryDate && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-ink-50 px-3.5 py-2.5">
          <CalendarClock size={15} className={expiringSoon ? 'text-amber-500' : 'text-ink-400'} />
          <span className="text-sm text-ink-700">
            Expiry: <span className="font-semibold">{formatExpiry(product.expiryDate)}</span>
          </span>
          {expiringSoon && (
            <Badge className="ml-auto bg-amber-50 text-amber-700 ring-amber-600/20">Expiring Soon</Badge>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-400">Stock by Location</div>
        <div className="text-xs text-ink-500">
          Total: <span className="font-semibold text-ink-700">{totalQty} {product.unit}</span> · {formatCurrency(totalQty * product.unitPrice)}
        </div>
      </div>
      <div className="mt-2 divide-y divide-ink-100 overflow-hidden rounded-xl ring-1 ring-ink-200/70">
        {locations.map((loc) => {
          const qty = byLocation.get(loc.id) ?? 0
          const status = loc.id === WAREHOUSE_ID ? 'healthy' : stockStatus(qty, product.minStock)
          const style = STATUS_STYLES[status]
          return (
            <div key={loc.id} className="flex items-center justify-between bg-white px-4 py-3">
              <span className="text-sm font-medium text-ink-700">{loc.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tabular-nums text-ink-900">
                  {qty} {product.unit}
                </span>
                {loc.id !== WAREHOUSE_ID && (
                  <Badge className={style.badge} dot={style.dot}>
                    {status === 'healthy' ? 'Healthy' : status === 'low' ? 'Low' : 'Out'}
                  </Badge>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-6 text-xs font-semibold uppercase tracking-wide text-ink-400">Recent Activity</div>
      <div className="mt-2 space-y-3">
        {relatedActivity.length === 0 && <p className="text-sm text-ink-400">No recent activity for this product yet.</p>}
        {relatedActivity.map((a) => (
          <div key={a.id} className="flex gap-3 text-sm">
            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-400">
              <Clock size={12} />
            </div>
            <div>
              <p className="text-ink-700">{a.message}</p>
              <p className="text-xs text-ink-400">{formatTime(a.createdAt)}</p>
            </div>
          </div>
        ))}
      </div>
      </Drawer>
      <ProductFormDrawer product={product} open={editOpen} onClose={() => setEditOpen(false)} />
    </>
  )
}
