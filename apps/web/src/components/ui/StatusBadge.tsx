import { Badge } from './Badge'
import type { RequestStatus, TransferStatus } from '../../types'

const REQUEST_STYLES: Record<RequestStatus, { label: string; className: string; dot: string }> = {
  PENDING: { label: 'Pending', className: 'bg-ink-100 text-ink-600 ring-ink-500/10', dot: 'bg-ink-400' },
  REVIEWING: { label: 'Reviewing', className: 'bg-blue-50 text-blue-700 ring-blue-600/20', dot: 'bg-blue-500' },
  APPROVED: { label: 'Approved', className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', dot: 'bg-emerald-500' },
  REJECTED: { label: 'Rejected', className: 'bg-rose-50 text-rose-700 ring-rose-600/20', dot: 'bg-rose-500' },
  CANCELLED: { label: 'Cancelled', className: 'bg-ink-100 text-ink-500 ring-ink-500/10', dot: 'bg-ink-400' },
  PARTIALLY_DELIVERED: { label: 'Partially Delivered', className: 'bg-amber-50 text-amber-700 ring-amber-600/20', dot: 'bg-amber-500' },
  DELIVERED: { label: 'Delivered', className: 'bg-brand-50 text-brand-700 ring-brand-600/20', dot: 'bg-brand-500' },
}

const TRANSFER_STYLES: Record<TransferStatus, { label: string; className: string; dot: string }> = {
  READY: { label: 'Ready for Delivery', className: 'bg-ink-100 text-ink-600 ring-ink-500/10', dot: 'bg-ink-400' },
  ASSIGNED: { label: 'Driver Assigned', className: 'bg-blue-50 text-blue-700 ring-blue-600/20', dot: 'bg-blue-500' },
  PICKING: { label: 'Picking', className: 'bg-amber-50 text-amber-700 ring-amber-600/20', dot: 'bg-amber-500' },
  OUT_FOR_DELIVERY: { label: 'Out for Delivery', className: 'bg-violet-50 text-violet-700 ring-violet-600/20', dot: 'bg-violet-500' },
  DELIVERED: { label: 'Delivered', className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', dot: 'bg-emerald-500' },
  PARTIALLY_DELIVERED: { label: 'Partially Delivered', className: 'bg-amber-50 text-amber-700 ring-amber-600/20', dot: 'bg-amber-500' },
  FAILED: { label: 'Failed', className: 'bg-rose-50 text-rose-700 ring-rose-600/20', dot: 'bg-rose-500' },
}

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const s = REQUEST_STYLES[status]
  return (
    <Badge className={s.className} dot={s.dot}>
      {s.label}
    </Badge>
  )
}

export function TransferStatusBadge({ status }: { status: TransferStatus }) {
  const s = TRANSFER_STYLES[status]
  return (
    <Badge className={s.className} dot={s.dot}>
      {s.label}
    </Badge>
  )
}
