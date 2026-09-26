import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { inventoryService } from '../services/inventoryService'
import { pickWarehouse } from '../lib/warehouse'

export function useProducts() {
  return useQuery({ queryKey: ['products'], queryFn: inventoryService.getProducts })
}

export function useProduct(productId: string | null) {
  return useQuery({
    queryKey: ['products', productId],
    queryFn: () => inventoryService.getProduct(productId!),
    enabled: !!productId,
  })
}

export function useLocations() {
  return useQuery({ queryKey: ['locations'], queryFn: inventoryService.getLocations })
}

/** The active warehouse, from the API's own location data. `isMissing` = locations loaded but none is a warehouse. */
export function useWarehouse() {
  const { data: locations, isLoading } = useLocations()
  const warehouse = pickWarehouse(locations)
  return { warehouse, warehouseId: warehouse?.id, isLoading, isMissing: !isLoading && !!locations && !warehouse }
}

export function useWarehouseAvailability(filter: { categoryId?: string; search?: string } = {}) {
  return useQuery({
    queryKey: ['warehouse-availability', filter.categoryId ?? null, filter.search ?? ''],
    queryFn: () => inventoryService.getWarehouseAvailability(filter),
  })
}

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: inventoryService.getCategories })
}

export function useCreateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: inventoryService.createProduct,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['warehouse-availability'] })
    },
  })
}

export function useUpdateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Parameters<typeof inventoryService.updateProduct>[1] }) =>
      inventoryService.updateProduct(id, dto),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['products', vars.id] })
      qc.invalidateQueries({ queryKey: ['warehouse-availability'] })
    },
  })
}
