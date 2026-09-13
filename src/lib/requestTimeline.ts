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
export const TRANSFER_STATUS_ORDER: TransferStatus[] = ['ready', 'assigned', 'picking', 'out_for_delivery', 'delivered']

export function getCurrentStep(request: StockRequest, transfer?: Transfer): number {
  if (request.status === 'pending') return STEP.SUBMITTED
  if (request.status === 'reviewing') return STEP.UNDER_REVIEW
  // The request's own 'delivered' status is authoritative: never let a
  // transfer record that hasn't been updated in lockstep override it.
  if (request.status === 'delivered' || transfer?.status === 'delivered') return STEP.DELIVERED
  if (transfer?.status === 'out_for_delivery') return STEP.OUT_FOR_DELIVERY
  return STEP.PREPARING // approved — a transfer is created the moment a request is approved
}

export function computeRequestTimeline(
  request: StockRequest,
  transfer?: Transfer,
): { label: string; state: TimelineState }[] {
  if (request.status === 'rejected') {
    return [
      { label: 'Submitted', state: 'done' },
      { label: 'Under Review', state: 'done' },
      { label: 'Rejected', state: 'rejected' },
    ]
  }

  const current = getCurrentStep(request, transfer)

  return LABELS.map((label, i) => ({
    label,
    state: current === STEP.DELIVERED ? 'done' : i < current ? 'done' : i === current ? 'current' : 'upcoming',
  }))
}
