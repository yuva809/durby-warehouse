import { useState } from 'react'
import { Truck, PackageCheck, CheckCircle2, ArrowRight, AlertTriangle, XCircle, RotateCcw } from 'lucide-react'
import { Drawer } from '../ui/Drawer'
import { Button } from '../ui/Button'
import { TimelineRow } from '../ui/Timeline'
import { useAuthStore } from '../../auth/authStore'
import { isBranchUser, isManager as checkIsManager } from '../../auth/roles'
import {
  useTransfer,
  useDrivers,
  useAssignDriver,
  useStartPicking,
  useSetPickedQty,
  useDispatch,
  useMarkDelivered,
  useConfirmReceipt,
  useFailDelivery,
  useRetryDelivery,
} from '../../hooks/useTransfers'
import { cn, formatDateTime } from '../../lib/utils'
import { TRANSFER_STATUS_ORDER } from '../../lib/requestTimeline'
import type { TransferStatus } from '../../types'
import { ApiError } from '../../lib/apiClient'

const STEPS: { key: TransferStatus; label: string }[] = [
  { key: 'READY', label: 'Ready for Delivery' },
  { key: 'ASSIGNED', label: 'Driver Assigned' },
  { key: 'PICKING', label: 'Picking' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for Delivery' },
  { key: 'DELIVERED', label: 'Delivered' },
]

export function TransferDrawer({ transferId, onClose }: { transferId: string | null; onClose: () => void }) {
  const user = useAuthStore((s) => s.user)
  const isManager = checkIsManager(user)
  const isBranch = isBranchUser(user)

  const { data: transfer } = useTransfer(transferId)
  const { data: drivers = [] } = useDrivers()
  const [driverPick, setDriverPick] = useState('')
  const [failReason, setFailReason] = useState('')
  const [failing, setFailing] = useState(false)
  const [pickedDraft, setPickedDraft] = useState<Record<string, number>>({})

  const assignDriver = useAssignDriver()
  const startPicking = useStartPicking()
  const setPickedQty = useSetPickedQty()
  const dispatch = useDispatch()
  const markDelivered = useMarkDelivered()
  const confirmReceipt = useConfirmReceipt()
  const failDelivery = useFailDelivery()
  const retryDelivery = useRetryDelivery()

  if (!transfer) return null

  const branchName = transfer.branch?.name ?? ''
  const currentIndex = TRANSFER_STATUS_ORDER.indexOf(transfer.status)
  const isTerminalDone = transfer.status === 'DELIVERED' || transfer.status === 'PARTIALLY_DELIVERED'

  const canDriverOrManagerOperate = isManager || (user?.role === 'DRIVER' && transfer.driverId === user.userId)
  const canBranchConfirm = isBranch && user?.locationId === transfer.branchId

  function persistPickedIfChanged(productId: string, qty: number) {
    const onServer = transfer!.items.find((i) => i.productId === productId)?.pickedQty
    if (qty !== onServer) setPickedQty.mutate({ transferId: transfer!.id, productId, pickedQty: qty })
  }

  return (
    <Drawer open={!!transferId} onClose={onClose} title={transfer.code} subtitle={`Central Warehouse → ${branchName} · ${formatDateTime(transfer.createdAt)}`}>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-400 mb-3">Timeline</div>
        <div className="space-y-0">
          <TimelineRow label="Request Approved" state="done" />
          <TimelineRow label="Transfer Created" state="done" />
          {transfer.status === 'FAILED' ? (
            <TimelineRow label={`Delivery Failed: ${transfer.failedReason}`} state="rejected" isLast />
          ) : (
            STEPS.map((step, i) => (
              <TimelineRow
                key={step.key}
                label={step.label}
                state={i < currentIndex || isTerminalDone ? 'done' : i === currentIndex ? 'current' : 'upcoming'}
                isLast={i === STEPS.length - 1}
              />
            ))
          )}
        </div>
      </div>

      <div className="mt-6">
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-400 mb-2">Items</div>
        <div className="divide-y divide-ink-50 overflow-hidden rounded-xl ring-1 ring-ink-200/70">
          {transfer.items.map((item) => (
            <div key={item.productId} className="bg-white px-3.5 py-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-ink-700">{item.product?.name}</span>
                <span className="font-semibold tabular-nums text-ink-900">{item.approvedQty} {item.product?.unit}</span>
              </div>
              {(item.pickedQty !== null && item.pickedQty !== undefined) && (
                <div className="mt-0.5 text-xs text-ink-400">
                  Picked: {item.pickedQty} {item.product?.unit}
                  {item.deliveredQty !== null && item.deliveredQty !== undefined && (
                    <>
                      {' '}
                      · Delivered: {item.deliveredQty} {item.product?.unit}
                      {item.deliveredQty !== item.pickedQty && (
                        <span className="ml-1 font-medium text-amber-600">
                          (diff {item.pickedQty - item.deliveredQty})
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {transfer.driverId && (
        <div className="mt-4 flex items-center justify-between rounded-xl bg-ink-50 px-3.5 py-2.5">
          <span className="text-sm text-ink-500">Driver</span>
          <span className="text-sm font-semibold text-ink-800">{drivers.find((d) => d.id === transfer.driverId)?.name ?? transfer.driver?.name}</span>
        </div>
      )}

      {(transfer.etaDate || transfer.etaWindowStart) && (
        <div className="mt-2 flex items-center justify-between rounded-xl bg-ink-50 px-3.5 py-2.5">
          <span className="text-sm text-ink-500">ETA</span>
          <span className="text-sm font-semibold text-ink-800">
            {transfer.etaDate ? new Date(transfer.etaDate).toLocaleDateString('en-GB') : ''}
            {transfer.etaWindowStart ? ` ${transfer.etaWindowStart}–${transfer.etaWindowEnd ?? ''}` : ''}
          </span>
        </div>
      )}

      {/* --- Manager: assign driver --- */}
      {isManager && (transfer.status === 'READY' || transfer.status === 'ASSIGNED') && (
        <div className="mt-6 border-t border-ink-100 pt-5">
          <div className="mb-2 text-sm font-medium text-ink-700">{transfer.status === 'ASSIGNED' ? 'Reassign Driver' : 'Assign Driver'}</div>
          <div className="flex gap-2">
            <select
              value={driverPick}
              onChange={(e) => setDriverPick(e.target.value)}
              className="flex-1 rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-800 outline-none ring-1 ring-inset ring-ink-200 focus:ring-brand-400"
            >
              <option value="">Select driver…</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <Button disabled={!driverPick || assignDriver.isPending} onClick={() => assignDriver.mutate({ id: transfer.id, driverId: driverPick })}>
              Assign
            </Button>
          </div>
        </div>
      )}

      {/* --- Driver/manager operational actions --- */}
      {canDriverOrManagerOperate && (
        <div className="mt-6 border-t border-ink-100 pt-5">
          {transfer.status === 'ASSIGNED' && (
            <Button className="w-full" size="lg" disabled={startPicking.isPending} onClick={() => startPicking.mutate(transfer.id)}>
              <Truck size={16} /> Start Picking
            </Button>
          )}

          {transfer.status === 'PICKING' && (
            <div>
              <div className="mb-2 text-sm font-medium text-ink-700">Picking — actual quantity</div>
              <div className="space-y-2">
                {transfer.items.map((item) => {
                  const value = pickedDraft[item.productId] ?? item.pickedQty ?? item.approvedQty
                  return (
                    <div key={item.productId} className="flex items-center gap-3 rounded-xl ring-1 ring-ink-200/70 p-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-ink-800">{item.product?.name}</div>
                        <div className="text-xs text-ink-400">Approved: {item.approvedQty} {item.product?.unit}</div>
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={item.approvedQty}
                        value={value}
                        onChange={(e) => setPickedDraft((s) => ({ ...s, [item.productId]: Math.max(0, Math.min(item.approvedQty, Number(e.target.value))) }))}
                        onBlur={(e) => persistPickedIfChanged(item.productId, Math.max(0, Math.min(item.approvedQty, Number(e.target.value))))}
                        className={cn(
                          'w-20 rounded-lg bg-ink-50 px-2 py-1.5 text-right text-sm font-semibold tabular-nums outline-none ring-1 ring-inset focus:ring-brand-400',
                          value !== item.approvedQty ? 'ring-amber-300 text-amber-700' : 'ring-ink-200 text-ink-700',
                        )}
                      />
                    </div>
                  )
                })}
              </div>
              <Button className="mt-4 w-full" size="lg" disabled={dispatch.isPending} onClick={() => dispatch.mutate(transfer.id)}>
                <ArrowRight size={16} /> {dispatch.isPending ? 'Starting…' : 'Start Delivery'}
              </Button>
              {dispatch.isError && (
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  <AlertTriangle size={14} className="shrink-0" />
                  {dispatch.error instanceof ApiError ? dispatch.error.message : 'Could not start delivery'}
                </div>
              )}
            </div>
          )}

          {transfer.status === 'OUT_FOR_DELIVERY' && (
            <div>
              <div className="rounded-xl bg-violet-50 px-3.5 py-3 text-sm text-violet-700">
                Delivery to <span className="font-semibold">{branchName}</span> is en route.
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setFailing((v) => !v)}
                >
                  <XCircle size={16} /> Failed
                </Button>
                <Button className="flex-1" size="lg" disabled={markDelivered.isPending} onClick={() => markDelivered.mutate({ transferId: transfer.id })}>
                  <PackageCheck size={16} /> {markDelivered.isPending ? 'Saving…' : 'Mark Delivered'}
                </Button>
              </div>
              {failing && (
                <div className="mt-3 space-y-2 rounded-xl ring-1 ring-ink-200/70 p-3">
                  <select
                    value={failReason}
                    onChange={(e) => setFailReason(e.target.value)}
                    className="w-full rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-800 outline-none ring-1 ring-inset ring-ink-200 focus:ring-rose-400"
                  >
                    <option value="">Reason…</option>
                    <option value="Branch closed">Branch closed</option>
                    <option value="Address issue">Address issue</option>
                    <option value="Vehicle issue">Vehicle issue</option>
                    <option value="Other">Other</option>
                  </select>
                  <Button
                    variant="danger"
                    className="w-full"
                    disabled={!failReason || failDelivery.isPending}
                    onClick={() => failDelivery.mutate({ transferId: transfer.id, reason: failReason }, { onSuccess: () => setFailing(false) })}
                  >
                    Confirm Failed Delivery
                  </Button>
                </div>
              )}
            </div>
          )}

          {transfer.status === 'FAILED' && (
            <div>
              <div className="rounded-xl bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
                <span className="font-semibold">Delivery failed:</span> {transfer.failedReason}
              </div>
              <div className="mt-3 flex gap-2">
                <select
                  value={driverPick}
                  onChange={(e) => setDriverPick(e.target.value)}
                  className="flex-1 rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-800 outline-none ring-1 ring-inset ring-ink-200 focus:ring-brand-400"
                >
                  <option value="">Same driver</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
                <Button disabled={retryDelivery.isPending} onClick={() => retryDelivery.mutate({ transferId: transfer.id, driverId: driverPick || undefined })}>
                  <RotateCcw size={15} /> Retry
                </Button>
              </div>
            </div>
          )}

          {isTerminalDone && (
            <div className="flex flex-col items-center gap-2 rounded-xl bg-emerald-50 py-6 text-center">
              <CheckCircle2 className="text-emerald-600" size={28} />
              <div className="font-display font-semibold text-emerald-700">
                {transfer.status === 'PARTIALLY_DELIVERED' ? 'Partially Delivered' : 'Delivery Completed'}
              </div>
              <div className="text-xs text-emerald-600">{branchName} inventory has been updated.</div>
            </div>
          )}
        </div>
      )}

      {/* --- Branch: confirm receipt --- */}
      {canBranchConfirm && isTerminalDone && (
        <div className="mt-6 border-t border-ink-100 pt-5">
          {transfer.confirmedAt ? (
            <div className="rounded-xl bg-emerald-50 px-3.5 py-3 text-center text-sm text-emerald-700">
              Receipt confirmed {formatDateTime(transfer.confirmedAt)}
            </div>
          ) : (
            <Button className="w-full" size="lg" disabled={confirmReceipt.isPending} onClick={() => confirmReceipt.mutate(transfer.id)}>
              <CheckCircle2 size={16} /> Confirm Receipt
            </Button>
          )}
        </div>
      )}
    </Drawer>
  )
}
