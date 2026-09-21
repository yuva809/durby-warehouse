// Types mirroring the NestJS API's response shapes (apps/api/prisma/schema.prisma).
// IDs are real database cuids now, except Location/Product ids, which the
// seed script deliberately kept identical to V1's slugs ('b1'..'b5',
// 'warehouse', 'ponni_boiled_rice_224', ...) for continuity.

export type Role = 'SUPER_ADMIN' | 'WAREHOUSE_MANAGER' | 'BRANCH_USER' | 'DRIVER'

export interface AuthUser {
  userId: string
  email: string
  name: string
  role: Role
  locationId: string | null
}

export type LocationType = 'WAREHOUSE' | 'BRANCH'

export interface Location {
  id: string
  name: string
  type: LocationType
  /** Short label for chart axes / compact chips, e.g. "Wilhelm 2" */
  shortName?: string | null
  city?: string | null
  active: boolean
}

export interface Product {
  id: string
  name: string
  sku: string
  category: string
  unit: string
  minStock: number
  unitPrice: number
  brand?: string | null
  /** Pack/case size as sold, e.g. "12x1kg" */
  pack?: string | null
  expiryDate?: string | null
  /**
   * Reference back to the customer's own source workbook row, kept for
   * traceability since the source has no standalone article/barcode field
   * for most categories. Demo-only convenience, not a real article number.
   */
  sourceRef?: string | null
  active: boolean
}

export type StockStatus = 'healthy' | 'low' | 'out'

/** One row from GET /inventory — never sent to a BRANCH_USER. */
export interface InventoryLine {
  locationId: string
  locationName: string
  productId: string
  productName: string
  sku: string
  unit: string
  onHand: number
  reserved: number
  available: number
}

export type MovementType = 'RECEIPT' | 'TRANSFER_OUT' | 'TRANSFER_IN' | 'DAMAGE' | 'EXPIRED' | 'RECOUNT' | 'ADJUSTMENT' | 'RETURN'

export interface InventoryMovement {
  id: string
  productId: string
  product: Product
  locationId: string
  location: Location
  quantity: number
  type: MovementType
  reference?: string | null
  reason?: string | null
  userId?: string | null
  createdAt: string
}

export type RequestStatus = 'PENDING' | 'REVIEWING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'PARTIALLY_DELIVERED' | 'DELIVERED'

export interface RequestItem {
  id: string
  productId: string
  product?: Product
  requestedQty: number
  approvedQty?: number | null
}

export interface StockRequest {
  id: string
  /** Human-facing code, e.g. "REQ-1024" — use this for display, `id` for API calls. */
  code: string
  branchId: string
  branch?: Location
  status: RequestStatus
  createdById: string
  reviewedById?: string | null
  reviewedAt?: string | null
  rejectionReason?: string | null
  cancelledAt?: string | null
  createdAt: string
  items: RequestItem[]
  transfer?: Transfer | null
}

export type TransferStatus = 'READY' | 'ASSIGNED' | 'PICKING' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'PARTIALLY_DELIVERED' | 'FAILED'

export interface TransferItem {
  id: string
  productId: string
  product?: Product
  /** Planned quantity, copied from the request's approvedQty at approval time. */
  approvedQty: number
  /** Actual picked quantity — authoritative for the stock movement at dispatch. */
  pickedQty?: number | null
  /** Actual delivered quantity — defaults to pickedQty, can be less if something didn't arrive. */
  deliveredQty?: number | null
}

export interface Driver {
  id: string
  name: string
}

export interface Transfer {
  id: string
  /** Human-facing code, e.g. "TR-1024". */
  code: string
  requestId: string
  request?: StockRequest
  branchId: string
  branch?: Location
  status: TransferStatus
  driverId?: string | null
  driver?: Driver | null
  etaDate?: string | null
  etaWindowStart?: string | null
  etaWindowEnd?: string | null
  outForDeliveryAt?: string | null
  deliveredAt?: string | null
  failedReason?: string | null
  failedAt?: string | null
  confirmedAt?: string | null
  confirmedById?: string | null
  createdAt: string
  items: TransferItem[]
}

export interface ActivityEvent {
  id: string
  message: string
  kind: 'request' | 'review' | 'transfer' | 'delivery' | 'inventory' | 'system'
  createdAt: string
  user?: { name: string } | null
}

export const WAREHOUSE_ID = 'warehouse'
