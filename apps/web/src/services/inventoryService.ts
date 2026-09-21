import { api } from '../lib/apiClient'
import type { InventoryLine, InventoryMovement, Location, Product } from '../types'

interface Page<T> {
  total: number
  page: number
  pageSize: number
  items: T[]
}

function normalizeProduct(p: Product): Product {
  // Prisma's Decimal serializes to a string over JSON — coerce back to number
  // once, here, so every caller downstream can keep treating unitPrice as a
  // plain number, same as V1.
  return { ...p, unitPrice: Number(p.unitPrice) }
}

/**
 * API client for the product/location catalog and (manager-only) inventory
 * levels. Same method names as V1's local-store version — only the
 * implementation changed, from a Zustand read to a real HTTP call.
 */
export const inventoryService = {
  async getProducts(): Promise<Product[]> {
    const products = await api.get<Product[]>('/products')
    return products.map(normalizeProduct)
  },

  async getProduct(productId: string): Promise<Product> {
    const product = await api.get<Product>(`/products/${productId}`)
    return normalizeProduct(product)
  },

  getLocations(): Promise<Location[]> {
    return api.get<Location[]>('/locations')
  },

  /** Manager/admin only — the API returns 403 for any other role. */
  async getInventory(locationId?: string): Promise<InventoryLine[]> {
    const query = locationId ? `?locationId=${locationId}&pageSize=200` : '?pageSize=200'
    const page = await api.get<Page<InventoryLine>>(`/inventory${query}`)
    return page.items
  },

  async getMovements(params: { productId?: string; locationId?: string } = {}): Promise<InventoryMovement[]> {
    const search = new URLSearchParams(params as Record<string, string>).toString()
    const page = await api.get<Page<InventoryMovement>>(`/inventory/movements${search ? `?${search}` : ''}`)
    return page.items
  },

  createAdjustment(input: { locationId: string; productId: string; quantity: number; reason: string; note?: string }) {
    return api.post('/inventory/adjustments', input)
  },
}
