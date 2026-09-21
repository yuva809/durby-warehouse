import type { Product, InventoryLine, StockRequest, Transfer } from '../types'
import { branchHealth, stockStatus } from './utils'

/** Manager-only: computes a branch's health/stats from the full (all-locations) inventory array. */
export function computeBranchStats(
  branchId: string,
  products: Product[],
  inventoryLines: InventoryLine[],
  requests: StockRequest[],
  transfers: Transfer[],
) {
  let lowCount = 0
  let outCount = 0
  let stockValue = 0
  const byProduct = new Map(inventoryLines.filter((l) => l.locationId === branchId).map((l) => [l.productId, l]))

  for (const p of products) {
    const qty = byProduct.get(p.id)?.onHand ?? 0
    stockValue += qty * p.unitPrice
    const status = stockStatus(qty, p.minStock)
    if (status === 'low') lowCount++
    if (status === 'out') outCount++
  }

  const pendingRequests = requests.filter((r) => r.branchId === branchId && (r.status === 'PENDING' || r.status === 'REVIEWING')).length
  const incomingDeliveries = transfers.filter((t) => t.branchId === branchId && t.status !== 'DELIVERED' && t.status !== 'PARTIALLY_DELIVERED').length
  const health = branchHealth(lowCount, outCount)

  return {
    productCount: products.length,
    lowStockCount: lowCount + outCount,
    pendingRequests,
    incomingDeliveries,
    stockValue,
    health,
  }
}
