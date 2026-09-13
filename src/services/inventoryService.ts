import { useWarehouseStore } from '../store/useWarehouseStore'
import { WAREHOUSE_ID } from '../types'
import { stockStatus } from '../lib/utils'

/**
 * Thin façade over the demo store. Every method here reads today from local/mock
 * state; when Durby Warehouse gets a real backend, these signatures stay the
 * same and only the implementation swaps to fetch/axios calls.
 */
export const inventoryService = {
  getProducts() {
    return useWarehouseStore.getState().products
  },
  getProduct(productId: string) {
    return useWarehouseStore.getState().products.find((p) => p.id === productId)
  },
  getLocations() {
    return useWarehouseStore.getState().locations
  },
  getBranches() {
    return useWarehouseStore.getState().locations.filter((l) => l.type === 'branch')
  },
  getWarehouse() {
    return useWarehouseStore.getState().locations.find((l) => l.id === WAREHOUSE_ID)!
  },
  getStock(locationId: string, productId: string) {
    return useWarehouseStore.getState().inventory[locationId]?.[productId] ?? 0
  },
  getInventoryForLocation(locationId: string) {
    return useWarehouseStore.getState().inventory[locationId] ?? {}
  },
  getStatus(locationId: string, productId: string) {
    const qty = this.getStock(locationId, productId)
    const product = this.getProduct(productId)
    return stockStatus(qty, product?.minStock ?? 0)
  },
  getWarehouseValue() {
    const state = useWarehouseStore.getState()
    return state.products.reduce((sum, p) => sum + (state.inventory[WAREHOUSE_ID]?.[p.id] ?? 0) * p.unitPrice, 0)
  },
}
