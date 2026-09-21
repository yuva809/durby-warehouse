import { useQuery } from '@tanstack/react-query'
import { inventoryService } from '../services/inventoryService'

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
