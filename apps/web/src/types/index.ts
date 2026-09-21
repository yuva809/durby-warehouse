export type LocationType = 'warehouse' | 'branch'

export interface Location {
  id: string
  name: string
  type: LocationType
  /** Short label for chart axes / compact chips, e.g. "Wilhelm 2" */
  shortName?: string
  city?: string
}

export interface Product {
  id: string
  name: string
  sku: string
  category: string
  unit: string
  minStock: number
  unitPrice: number
  brand?: string
  /** Pack/case size as sold, e.g. "12x1kg" */
  pack?: string
  expiryDate?: string
  /**
   * Reference back to the customer's own source workbook row, kept for
   * traceability since the source has no standalone article/barcode field
   * for most categories. Demo-only convenience, not a real article number.
   */
  sourceRef?: string
}

/** locationId -> productId -> quantity */
export type InventoryMap = Record<string, Record<string, number>>

export type StockStatus = 'healthy' | 'low' | 'out'

export type RequestStatus = 'pending' | 'reviewing' | 'approved' | 'rejected' | 'delivered'

export interface RequestItem {
  productId: string
  requestedQty: number
  approvedQty?: number
}

export interface StockRequest {
  id: string
  branchId: string
  items: RequestItem[]
  status: RequestStatus
  createdAt: string
  reviewedAt?: string
  rejectionReason?: string
}

export type TransferStatus = 'ready' | 'assigned' | 'picking' | 'out_for_delivery' | 'delivered'

export interface TransferItem {
  productId: string
  qty: number
  pickedQty?: number
}

export interface Transfer {
  id: string
  requestId: string
  branchId: string
  items: TransferItem[]
  status: TransferStatus
  driverId?: string
  createdAt: string
  deliveredAt?: string
}

export interface Driver {
  id: string
  name: string
}

export interface ActivityEvent {
  id: string
  timestamp: string
  message: string
  kind: 'request' | 'review' | 'transfer' | 'delivery' | 'inventory' | 'system'
}

export type ViewerRole =
  | 'overview'
  | 'warehouse_manager'
  | 'b1'
  | 'b2'
  | 'b3'
  | 'b4'
  | 'b5'
  | 'delivery_person'

export const WAREHOUSE_ID = 'warehouse'
export const BRANCH_IDS = ['b1', 'b2', 'b3', 'b4', 'b5'] as const
