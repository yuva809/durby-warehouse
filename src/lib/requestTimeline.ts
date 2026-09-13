import type { StockRequest, Transfer } from '../types'
import type { TimelineState } from '../components/ui/Timeline'

const LABELS = ['Submitted', 'Under Review', 'Approved', 'Preparing', 'Out for Delivery', 'Delivered']

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

  let current: number
  if (request.status === 'pending') current = 0
  else if (request.status === 'reviewing') current = 1
  else if (transfer?.status === 'out_for_delivery') current = 4
  else if (transfer?.status === 'delivered' || request.status === 'delivered') current = 5
  else current = 3 // approved — a transfer is created the moment a request is approved

  return LABELS.map((label, i) => ({
    label,
    state: current === 5 ? 'done' : i < current ? 'done' : i === current ? 'current' : 'upcoming',
  }))
}
