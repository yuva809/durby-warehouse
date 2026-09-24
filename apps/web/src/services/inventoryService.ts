import { api } from '../lib/apiClient'
import type { InventoryLine, InventoryMovement, Location, Product, ProductCategory, WarehouseAvailability } from '../types'

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

// The API caps pageSize at 200 server-side regardless of what's requested
// (e.g. 6 locations x 47 products = 282 inventory rows already exceeds
// that), so a single request can silently come back short. Page through
// until every row is collected instead of trusting one page to be everything.
async function fetchAllPages<T>(path: string, baseParams: string): Promise<T[]> {
  const items: T[] = []
  let page = 1
  for (;;) {
    const query = `${baseParams ? `${baseParams}&` : ''}page=${page}&pageSize=200`
    const res = await api.get<Page<T>>(`${path}?${query}`)
    items.push(...res.items)
    if (items.length >= res.total || res.items.length === 0) return items
    page += 1
  }
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

  /** Open to every role, branches included — never onHand/reserved, just the computed available-from-warehouse number. */
  getWarehouseAvailability(filter: { categoryId?: string; search?: string } = {}): Promise<WarehouseAvailability[]> {
    const params = new URLSearchParams()
    if (filter.categoryId) params.set('categoryId', filter.categoryId)
    if (filter.search) params.set('search', filter.search)
    const qs = params.toString()
    return api.get<WarehouseAvailability[]>(`/products/availability${qs ? `?${qs}` : ''}`)
  },

  getCategories(): Promise<ProductCategory[]> {
    return api.get<ProductCategory[]>('/categories')
  },

  async createProduct(dto: {
    sku: string
    name: string
    barcode?: string
    category: string
    categoryId?: string
    brand?: string
    pack?: string
    unit: string
    minStock?: number
    unitPrice: number
  }): Promise<Product> {
    const product = await api.post<Product>('/products', dto)
    return normalizeProduct(product)
  },

  async updateProduct(
    id: string,
    dto: Partial<{
      name: string
      barcode: string
      category: string
      categoryId: string
      brand: string
      pack: string
      unit: string
      minStock: number
      unitPrice: number
    }>,
  ): Promise<Product> {
    const product = await api.patch<Product>(`/products/${id}`, dto)
    return normalizeProduct(product)
  },

  /** Manager/admin only — the API returns 403 for any other role. */
  getInventory(locationId?: string): Promise<InventoryLine[]> {
    return fetchAllPages<InventoryLine>('/inventory', locationId ? `locationId=${locationId}` : '')
  },

  getMovements(params: { productId?: string; locationId?: string } = {}): Promise<InventoryMovement[]> {
    const search = new URLSearchParams(params as Record<string, string>).toString()
    return fetchAllPages<InventoryMovement>('/inventory/movements', search)
  },

  createAdjustment(input: { locationId: string; productId: string; quantity: number; reason: string; note?: string }) {
    return api.post('/inventory/adjustments', input)
  },
}
