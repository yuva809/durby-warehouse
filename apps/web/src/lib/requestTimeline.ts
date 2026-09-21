import type { StockRequest, Transfer, TransferStatus } from '../types'
import type { TimelineState } from '../components/ui/Timeline'

const LABELS = ['Submitted', 'Under Review', 'Approved', 'Preparing', 'Out for Delivery', 'Delivered']

const STEP = {
  SUBMITTED: 0,
  UNDER_REVIEW: 1,
  APPROVED: 2,
  PREPARING: 3,
  OUT_FOR_DELIVERY: 4,
  DELIVERED: 5,
} as const

// A transfer's own lifecycle order — shared with TransferDrawer so both
// screens agree on what counts as "before/after" a given transfer status.
export const TRANSFER_STATUS_ORDER: TransferStatus[] = ['READY', 'ASSIGNED', 'PICKING', 'OUT_FOR_DELIVERY', 'DELIVERED']

export function getCurrentStep(request: StockRequest, transfer?: Transfer | null): number {
  if (request.status === 'PENDING') return STEP.SUBMITTED
  if (request.status === 'REVIEWING') return STEP.UNDER_REVIEW
  // The request's own delivered/partially-delivered status is authoritative:
  // never let a transfer record that hasn't been updated in lockstep
  // override it.
  if (request.status === 'DELIVERED' || request.status === 'PARTIALLY_DELIVERED' || transfer?.status === 'DELIVERED' || transfer?.status === 'PARTIALLY_DELIVERED') {
    return STEP.DELIVERED
  }
  if (transfer?.status === 'OUT_FOR_DELIVERY') return STEP.OUT_FOR_DELIVERY
  return STEP.PREPARING // approved — a transfer is created the moment a request is approved
}

export function computeRequestTimeline(
  request: StockRequest,
  transfer?: Transfer | null,
): { label: string; state: TimelineState }[] {
  if (request.status === 'REJECTED') {
    return [
      { label: 'Submitted', state: 'done' },
      { label: 'Under Review', state: 'done' },
      { label: 'Rejected', state: 'rejected' },
    ]
  }
  if (request.status === 'CANCELLED') {
    return [
      { label: 'Submitted', state: 'done' },
      { label: 'Cancelled', state: 'rejected' },
    ]
  }

  const current = getCurrentStep(request, transfer)

  return LABELS.map((label, i) => ({
    label,
    state: current === STEP.DELIVERED ? 'done' : i < current ? 'done' : i === current ? 'current' : 'upcoming',
  }))
}
