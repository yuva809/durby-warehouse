import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { inventoryService } from '../services/inventoryService'
import { useAuthStore } from '../auth/authStore'

/** Manager/admin only — the API 403s for any other role, so this is never called from a branch/driver screen. */
export function useInventory(locationId?: string, opts: { skip?: boolean } = {}) {
  const role = useAuthStore((s) => s.user?.role)
  const canSee = role === 'SUPER_ADMIN' || role === 'WAREHOUSE_MANAGER'
  return useQuery({
    queryKey: ['inventory', locationId ?? 'all'],
    queryFn: () => inventoryService.getInventory(locationId),
    // `skip`: the caller wants ONE location but does not know its id yet: never fall back to "all locations".
    enabled: canSee && !opts.skip,
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
