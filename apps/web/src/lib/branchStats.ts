import type { Product, InventoryMap, StockRequest, Transfer } from '../types'
import { branchHealth, stockStatus } from './utils'

export function computeBranchStats(
  branchId: string,
  products: Product[],
  inventory: InventoryMap,
  requests: StockRequest[],
  transfers: Transfer[],
) {
  let lowCount = 0
  let outCount = 0
  let stockValue = 0
  for (const p of products) {
    const qty = inventory[branchId]?.[p.id] ?? 0
    stockValue += qty * p.unitPrice
    const status = stockStatus(qty, p.minStock)
    if (status === 'low') lowCount++
    if (status === 'out') outCount++
  }

  const pendingRequests = requests.filter((r) => r.branchId === branchId && (r.status === 'pending' || r.status === 'reviewing')).length
  const incomingDeliveries = transfers.filter((t) => t.branchId === branchId && t.status !== 'delivered').length
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
