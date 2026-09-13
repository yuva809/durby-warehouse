import { useState } from 'react'
import { Check, Truck, PackageCheck, CheckCircle2, ArrowRight } from 'lucide-react'
import { Drawer } from '../ui/Drawer'
import { Button } from '../ui/Button'
import { TimelineRow } from '../ui/Timeline'
import { useWarehouseStore } from '../../store/useWarehouseStore'
import { transferService } from '../../services/transferService'
import { deliveryService } from '../../services/deliveryService'
import { cn, formatDateTime } from '../../lib/utils'
import type { TransferStatus } from '../../types'

const STATUS_ORDER: TransferStatus[] = ['ready', 'assigned', 'picking', 'out_for_delivery', 'delivered']

const STEPS: { key: TransferStatus; label: string }[] = [
  { key: 'ready', label: 'Ready for Delivery' },
  { key: 'assigned', label: 'Driver Assigned' },
  { key: 'picking', label: 'Picking' },
  { key: 'out_for_delivery', label: 'Out for Delivery' },
  { key: 'delivered', label: 'Delivered' },
]

export function TransferDrawer({ transferId, onClose }: { transferId: string | null; onClose: () => void }) {
  const view = useWarehouseStore((s) => s.view)
  const transfer = useWarehouseStore((s) => s.transfers.find((t) => t.id === transferId))
  const products = useWarehouseStore((s) => s.products)
  const locations = useWarehouseStore((s) => s.locations)
  const drivers = useWarehouseStore((s) => s.drivers)
  const [driverPick, setDriverPick] = useState('')

  const canOperate = view !== 'b1' && view !== 'b2' && view !== 'b3' && view !== 'b4' && view !== 'b5'

  if (!transfer) return null

  const branchName = locations.find((l) => l.id === transfer.branchId)?.name ?? ''
  const currentIndex = STATUS_ORDER.indexOf(transfer.status)
  const allPicked = transfer.items.every((it) => (it.pickedQty ?? 0) >= it.qty)

  return (
    <Drawer open={!!transferId} onClose={onClose} title={transfer.id} subtitle={`Central Warehouse → ${branchName} · ${formatDateTime(transfer.createdAt)}`}>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-400 mb-3">Timeline</div>
        <div className="space-y-0">
          <TimelineRow label="Request Approved" state="done" />
          <TimelineRow label="Transfer Created" state="done" />
          {STEPS.map((step, i) => (
            <TimelineRow
              key={step.key}
              label={step.label}
              state={i < currentIndex || transfer.status === 'delivered' ? 'done' : i === currentIndex ? 'current' : 'upcoming'}
              isLast={i === STEPS.length - 1}
            />
          ))}
        </div>
      </div>

      <div className="mt-6">
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-400 mb-2">Items</div>
        <div className="divide-y divide-ink-50 overflow-hidden rounded-xl ring-1 ring-ink-200/70">
          {transfer.items.map((item) => {
            const product = products.find((p) => p.id === item.productId)!
            return (
              <div key={item.productId} className="flex items-center justify-between bg-white px-3.5 py-2.5 text-sm">
                <span className="font-medium text-ink-700">{product.name}</span>
                <span className="font-semibold tabular-nums text-ink-900">{item.qty} {product.unit}</span>
              </div>
            )
          })}
        </div>
      </div>

      {transfer.driverId && (
        <div className="mt-4 flex items-center justify-between rounded-xl bg-ink-50 px-3.5 py-2.5">
          <span className="text-sm text-ink-500">Driver</span>
          <span className="text-sm font-semibold text-ink-800">{drivers.find((d) => d.id === transfer.driverId)?.name}</span>
        </div>
      )}

      {canOperate && (
        <div className="mt-6 border-t border-ink-100 pt-5">
          {transfer.status === 'ready' && (
            <div>
              <div className="mb-2 text-sm font-medium text-ink-700">Assign Driver</div>
              <div className="flex gap-2">
                <select
                  value={driverPick}
                  onChange={(e) => setDriverPick(e.target.value)}
                  className="flex-1 rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-800 outline-none ring-1 ring-inset ring-ink-200 focus:ring-brand-400"
                >
                  <option value="">Select driver…</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <Button disabled={!driverPick} onClick={() => transferService.assignDriver(transfer.id, driverPick)}>
                  Assign
                </Button>
              </div>
            </div>
          )}

          {transfer.status === 'assigned' && (
            <Button className="w-full" size="lg" onClick={() => deliveryService.startPicking(transfer.id)}>
              <Truck size={16} /> Start Picking
            </Button>
          )}

          {transfer.status === 'picking' && (
            <div>
              <div className="mb-2 text-sm font-medium text-ink-700">Picking Checklist</div>
              <div className="space-y-2">
                {transfer.items.map((item) => {
                  const product = products.find((p) => p.id === item.productId)!
                  const picked = item.pickedQty ?? 0
                  const done = picked >= item.qty
                  return (
                    <div key={item.productId} className="flex items-center gap-3 rounded-xl ring-1 ring-ink-200/70 p-3">
                      <button
                        onClick={() => deliveryService.setPickedQty(transfer.id, item.productId, done ? 0 : item.qty)}
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset cursor-pointer',
                          done ? 'bg-emerald-500 text-white ring-emerald-500' : 'bg-white text-ink-300 ring-ink-200',
                        )}
                      >
                        <Check size={15} />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-ink-800">{product.name}</div>
                        <div className="text-xs text-ink-400">
                          Required: {item.qty} {product.unit} · Picked: {picked} {product.unit}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <Button className="mt-4 w-full" size="lg" disabled={!allPicked} onClick={() => deliveryService.startDelivery(transfer.id)}>
                <ArrowRight size={16} /> Start Delivery
              </Button>
            </div>
          )}

          {transfer.status === 'out_for_delivery' && (
            <div>
              <div className="rounded-xl bg-violet-50 px-3.5 py-3 text-sm text-violet-700">
                Delivery to <span className="font-semibold">{branchName}</span> is en route.
              </div>
              <Button className="mt-3 w-full" size="lg" onClick={() => deliveryService.markDelivered(transfer.id)}>
                <PackageCheck size={16} /> Mark Delivered
              </Button>
            </div>
          )}

          {transfer.status === 'delivered' && (
            <div className="flex flex-col items-center gap-2 rounded-xl bg-emerald-50 py-6 text-center">
              <CheckCircle2 className="text-emerald-600" size={28} />
              <div className="font-display font-semibold text-emerald-700">Delivery Completed</div>
              <div className="text-xs text-emerald-600">{branchName} inventory has been updated automatically.</div>
            </div>
          )}
        </div>
      )}
    </Drawer>
  )
}
