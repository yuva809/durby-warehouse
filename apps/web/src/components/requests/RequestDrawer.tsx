import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, AlertTriangle, XCircle, PackageCheck } from 'lucide-react'
import { Drawer } from '../ui/Drawer'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { RequestStatusBadge } from '../ui/StatusBadge'
import { Timeline } from '../ui/Timeline'
import { useAuthStore } from '../../auth/authStore'
import { isBranchUser, isManager as checkIsManager } from '../../auth/roles'
import { useRequest, useMarkReviewing, useUpdateApprovedQty, useApproveRequest, useRejectRequest, useCancelRequest } from '../../hooks/useRequests'
import { useInventory } from '../../hooks/useInventory'
import { cn, formatDateTime } from '../../lib/utils'
import { computeRequestTimeline } from '../../lib/requestTimeline'
import { WAREHOUSE_ID } from '../../types'
import { ApiError } from '../../lib/apiClient'

export function RequestDrawer({
  requestId,
  onClose,
  onViewTransfer,
}: {
  requestId: string | null
  onClose: () => void
  onViewTransfer?: (transferId: string) => void
}) {
  const user = useAuthStore((s) => s.user)
  const isManager = checkIsManager(user)

  const { data: request } = useRequest(requestId)
  const markReviewing = useMarkReviewing()
  const updateApprovedQty = useUpdateApprovedQty()
  const approveRequest = useApproveRequest()
  const rejectRequest = useRejectRequest()
  const cancelRequest = useCancelRequest()

  const canReview = isManager && (request?.status === 'PENDING' || request?.status === 'REVIEWING')
  const canCancel = isBranchUser(user) && (request?.status === 'PENDING' || request?.status === 'REVIEWING')
  const { data: warehouseInventory } = useInventory(WAREHOUSE_ID)
  const available = useMemo(() => {
    const map = new Map<string, number>()
    for (const line of warehouseInventory ?? []) map.set(line.productId, line.available)
    return map
  }, [warehouseInventory])

  const [confirming, setConfirming] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [justApprovedTransferCode, setJustApprovedTransferCode] = useState<string | null>(null)
  const [justApprovedTransferId, setJustApprovedTransferId] = useState<string | null>(null)
  const [draftApproved, setDraftApproved] = useState<Record<string, number>>({})

  useEffect(() => {
    setConfirming(false)
    setRejecting(false)
    setReason('')
    setJustApprovedTransferCode(null)
    setJustApprovedTransferId(null)
    setDraftApproved({})
  }, [requestId])

  useEffect(() => {
    if (request && isManager && request.status === 'PENDING') {
      markReviewing.mutate(request.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.id])

  const rows = useMemo(() => {
    if (!request) return []
    return request.items.map((item) => {
      const approved = draftApproved[item.productId] ?? item.approvedQty ?? item.requestedQty
      const stock = available.get(item.productId) ?? 0
      return { item, product: item.product!, available: stock, approved, sufficient: stock >= item.requestedQty }
    })
  }, [request, draftApproved, available])

  function persistQtyIfChanged(productId: string, qty: number) {
    if (!request) return
    const onServer = request.items.find((i) => i.productId === productId)?.approvedQty ?? request.items.find((i) => i.productId === productId)?.requestedQty
    if (qty !== onServer) {
      updateApprovedQty.mutate({ id: request.id, productId, approvedQty: qty })
    }
  }

  async function handleApprove() {
    if (!request) return
    // Flush any edited-but-not-yet-blurred quantities before approving.
    await Promise.all(
      Object.entries(draftApproved).map(([productId, qty]) => {
        const onServer = request.items.find((i) => i.productId === productId)?.approvedQty ?? request.items.find((i) => i.productId === productId)?.requestedQty
        return qty !== onServer ? updateApprovedQty.mutateAsync({ id: request.id, productId, approvedQty: qty }) : Promise.resolve()
      }),
    )
    try {
      const transfer = await approveRequest.mutateAsync(request.id)
      setJustApprovedTransferCode(transfer.code)
      setJustApprovedTransferId(transfer.id)
    } catch {
      // ApiError already surfaced via approveRequest.error below
    }
    setConfirming(false)
  }

  function handleReject() {
    if (!request || !reason.trim()) return
    rejectRequest.mutate({ id: request.id, reason: reason.trim() }, { onSuccess: () => setRejecting(false) })
  }

  if (!request) return null

  const branchName = request.branch?.name ?? ''
  const linkedTransfer = request.transfer

  return (
    <>
      <Drawer
        open={!!requestId}
        onClose={onClose}
        title={request.code}
        subtitle={`${branchName} · ${formatDateTime(request.createdAt)}`}
        footer={
          justApprovedTransferId ? (
            <Button className="w-full" onClick={() => { onViewTransfer?.(justApprovedTransferId); onClose() }}>
              View Transfer {justApprovedTransferCode}
            </Button>
          ) : canReview ? (
            rejecting ? (
              <div className="space-y-2">
                <textarea
                  autoFocus
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason for rejection…"
                  rows={2}
                  className="w-full rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-800 outline-none ring-1 ring-inset ring-ink-200 placeholder:text-ink-400 focus:ring-rose-400"
                />
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setRejecting(false)}>
                    Cancel
                  </Button>
                  <Button variant="danger" className="flex-1" disabled={!reason.trim() || rejectRequest.isPending} onClick={handleReject}>
                    Confirm Rejection
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setRejecting(true)}>
                  <XCircle size={15} /> Reject Request
                </Button>
                <Button className="flex-1" onClick={() => setConfirming(true)}>
                  <CheckCircle2 size={15} /> Approve Request
                </Button>
              </div>
            )
          ) : canCancel ? (
            <Button
              variant="outline"
              className="w-full"
              disabled={cancelRequest.isPending}
              onClick={() => cancelRequest.mutate(request.id)}
            >
              <XCircle size={15} /> {cancelRequest.isPending ? 'Cancelling…' : 'Cancel Request'}
            </Button>
          ) : request.status === 'REJECTED' ? (
            <div className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
              <span className="font-medium">Rejected: </span>
              {request.rejectionReason}
            </div>
          ) : request.status === 'CANCELLED' ? (
            <div className="rounded-lg bg-ink-100 px-3.5 py-2.5 text-center text-sm text-ink-500">
              This request was cancelled.
            </div>
          ) : linkedTransfer ? (
            <Button variant="outline" className="w-full" onClick={() => { onViewTransfer?.(linkedTransfer.id); onClose() }}>
              View Transfer {linkedTransfer.code}
            </Button>
          ) : null
        }
      >
        <div className="mb-5 flex items-center justify-between">
          <span className="text-sm text-ink-500">Status</span>
          <RequestStatusBadge status={request.status} />
        </div>

        <div className="mb-6">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-400">Timeline</div>
          <Timeline steps={computeRequestTimeline(request, linkedTransfer)} />
        </div>

        <div className="space-y-3">
          {rows.map(({ item, product, available: stock, approved, sufficient }) => (
            <div key={item.productId} className="rounded-xl ring-1 ring-ink-200/70 p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-ink-900">{product.name}</span>
                {canReview &&
                  (sufficient ? (
                    <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">Available ✓</Badge>
                  ) : (
                    <Badge className="bg-rose-50 text-rose-700 ring-rose-600/20">
                      <AlertTriangle size={11} /> Insufficient
                    </Badge>
                  ))}
              </div>
              <div className={cn('mt-2 grid gap-2 text-xs', isManager ? 'grid-cols-3' : 'grid-cols-2')}>
                {isManager && (
                  <div>
                    <div className="text-ink-400">Warehouse</div>
                    <div className="font-semibold text-ink-700 tabular-nums">{stock} {product.unit}</div>
                  </div>
                )}
                <div>
                  <div className="text-ink-400">Requested</div>
                  <div className="font-semibold text-ink-700 tabular-nums">{item.requestedQty} {product.unit}</div>
                </div>
                <div>
                  <div className="text-ink-400">Approved</div>
                  {canReview ? (
                    <input
                      type="number"
                      min={0}
                      value={approved}
                      onChange={(e) => setDraftApproved((s) => ({ ...s, [item.productId]: Math.max(0, Number(e.target.value)) }))}
                      onBlur={(e) => persistQtyIfChanged(item.productId, Math.max(0, Number(e.target.value)))}
                      className={cn(
                        'w-full rounded-md bg-ink-50 px-2 py-1 text-sm font-semibold tabular-nums outline-none ring-1 ring-inset focus:ring-brand-400',
                        approved !== item.requestedQty ? 'ring-amber-300 text-amber-700' : 'ring-ink-200 text-ink-700',
                      )}
                    />
                  ) : (
                    <div className="font-semibold tabular-nums text-ink-700">
                      {item.approvedQty ?? '—'} {item.approvedQty !== undefined && item.approvedQty !== null ? product.unit : ''}
                    </div>
                  )}
                </div>
              </div>
              {canReview && approved !== item.requestedQty && (
                <div className="mt-1.5 text-[11px] text-amber-600">
                  Requested: {item.requestedQty} {product.unit} → Approved: {approved} {product.unit}
                </div>
              )}
            </div>
          ))}
        </div>
      </Drawer>

      <Modal open={confirming} onClose={() => setConfirming(false)}>
        <div className="p-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <PackageCheck size={20} />
          </div>
          <h3 className="mt-3 font-display text-lg font-bold text-ink-900">Confirm Stock Transfer</h3>
          <p className="text-sm text-ink-500">Branch: {branchName}</p>

          <div className="mt-4 space-y-2">
            {rows.map(({ item, product, approved }) => (
              <div key={item.productId} className="flex items-center justify-between text-sm">
                <span className="text-ink-700">{product.name}</span>
                <span className="font-semibold tabular-nums text-ink-900">{approved} {product.unit}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl bg-ink-50 p-3.5">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              Warehouse stock after transfer
            </div>
            <div className="space-y-1.5">
              {rows.map(({ item, product, available: stock, approved }) => (
                <div key={item.productId} className="flex items-center justify-between text-sm">
                  <span className="text-ink-600">{product.name}</span>
                  <span className="font-semibold tabular-nums text-ink-900">
                    {stock} → {Math.max(0, stock - approved)} {product.unit}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {approveRequest.isError && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <AlertTriangle size={14} className="shrink-0" />
              {approveRequest.error instanceof ApiError ? approveRequest.error.message : 'Could not approve this request'}
            </div>
          )}

          <div className="mt-5 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button className="flex-1" disabled={approveRequest.isPending} onClick={handleApprove}>
              {approveRequest.isPending ? 'Confirming…' : 'Confirm Transfer'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
