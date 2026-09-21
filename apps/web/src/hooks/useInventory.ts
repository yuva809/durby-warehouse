import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { inventoryService } from '../services/inventoryService'
import { useAuthStore } from '../auth/authStore'

/** Manager/admin only — the API 403s for any other role, so this is never called from a branch/driver screen. */
export function useInventory(locationId?: string) {
  const role = useAuthStore((s) => s.user?.role)
  const canSee = role === 'SUPER_ADMIN' || role === 'WAREHOUSE_MANAGER'
  return useQuery({
    queryKey: ['inventory', locationId ?? 'all'],
    queryFn: () => inventoryService.getInventory(locationId),
    enabled: canSee,
  })
}

export function useMovements(params: { productId?: string; locationId?: string } = {}) {
  return useQuery({
    queryKey: ['movements', params],
    queryFn: () => inventoryService.getMovements(params),
  })
}

export function useCreateAdjustment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: inventoryService.createAdjustment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['movements'] })
      qc.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}
