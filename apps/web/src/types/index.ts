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
  /** True until the user has chosen their own password; the server refuses everything else until then. */
  mustChangePassword?: boolean
}

/** A row from GET /users (never contains password data). */
export interface ManagedUser {
  id: string
  email: string
  name: string
  role: Role
  locationId: string | null
  active: boolean
  passwordChangeRequired: boolean
  createdAt: string
  /** Derived server-side from `active` and the person's latest invitation. */
  status: UserStatus
  invitation: UserInvitationInfo | null
}

export type UserStatus = 'ACTIVE' | 'DEACTIVATED' | 'INVITED' | 'INVITE_EXPIRED' | 'INVITE_REVOKED'

export interface UserInvitationInfo {
  state: 'PENDING' | 'EXPIRED' | 'REVOKED' | 'ACCEPTED'
  sentAt: string
  expiresAt: string
  acceptedAt: string | null
  invitedBy: string | null
}

/** Response to POST /users/invitations and .../invitation/resend. `code` is shown once and never retrievable again. */
export interface InvitationIssued {
  user: ManagedUser
  invitation: { code: string; expiresAt: string }
}

/** Response to POST /users/:id/reset-password. `code` is shown once and never retrievable again. */
export interface PasswordResetIssued {
  user: { id: string; email: string; name: string; role: Role }
  code: string
  expiresAt: string
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

export interface ProductCategory {
  id: string
  name: string
  icon?: string | null
  description?: string | null
  active: boolean
  displayOrder: number
  productCount?: number
}

export interface Product {
  id: string
  name: string
  sku: string
  category: string
  categoryId?: string | null
  /** Real EAN/GTIN/UPC, when known — separate from `sku`. Used to match invoice lines to products. */
  barcode?: string | null
  /** The STOCK unit: what every quantity for this product is counted in (e.g. "carton"). */
  unit: string
  /** Individual units in one stock unit (e.g. 24 bottles per carton) — reference/reporting only. */
  packSize?: number | null
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
  packSize?: number | null
  /** onHand x packSize, when the pack size is known. */
  unitsOnHand?: number | null
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
  /** Internal reference code, e.g. "REQ-1024" — `id` is still what API calls use. */
  code: string
  /** Customer-facing Order Confirmation number, e.g. "OC-000058" — use this for display. */
  ocNumber: string
  branchId: string
  branch?: Location
  status: RequestStatus
  createdById: string
  createdBy?: { name: string }
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
  /** Why pickedQty is less than approvedQty (damaged, rotten, short, etc). Required by the API whenever that's the case. */
  shortageReason?: string | null
}

/** One row from GET /products/availability — the only stock number a branch ever sees. */
export interface WarehouseAvailability {
  productId: string
  productName: string
  sku: string
  category: string
  categoryId?: string | null
  unit: string
  availableQuantity: number
}

export interface Driver {
  id: string
  name: string
}

export interface Transfer {
  id: string
  /** Internal reference code, e.g. "TR-1024". */
  code: string
  /** Customer-facing Delivery Challan number, e.g. "DC-000036" — null until dispatch(); use this for display once set. */
  dcNumber?: string | null
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
  kind: 'request' | 'review' | 'transfer' | 'delivery' | 'inventory' | 'system' | 'security'
  createdAt: string
  user?: { name: string } | null
}

export type SupplierInvoiceStatus = 'DRAFT' | 'UNDER_REVIEW' | 'CONFIRMED' | 'CANCELLED'

export interface SupplierInvoiceItem {
  id: string
  invoiceId: string
  productId?: string | null
  product?: { id: string; name: string; sku: string; unit: string; packSize?: number | null } | null
  rawDescription: string
  rawProductCode?: string | null
  unit?: string | null
  /** In STOCK units (cartons). */
  invoiceQty: number
  packSize?: number | null
  /** invoiceQty x packSize: individual units on this line. */
  totalUnits?: number | null
  /** Decimals arrive from the API as text. */
  unitPrice?: string | null
  priceBasis?: 'CARTON' | 'UNIT' | null
  lineAmount?: string | null
  isFree?: boolean
  batchNumber?: string | null
  expiryDate?: string | null
  receivedQty?: number | null
  matchConfidence?: string | null
  needsReview: boolean
}

export interface SupplierInvoice {
  id: string
  code: string
  supplierName: string
  invoiceNumber: string
  invoiceDate?: string | null
  status: SupplierInvoiceStatus
  sourceFileName?: string | null
  sourceFileType?: string | null
  uploadedById: string
  uploadedBy?: { name: string }
  confirmedById?: string | null
  confirmedBy?: { name: string } | null
  confirmedAt?: string | null
  /** The total the invoice declares, and the sum of the parsed line amounts (text decimals; null when the format has no amounts). */
  invoiceTotal?: string | null
  linesTotal?: string | null
  currency?: string | null
  createdAt: string
  items?: SupplierInvoiceItem[]
  _count?: { items: number }
}
