import { api } from '../lib/apiClient'
import type { Transfer } from '../types'

export const deliveryService = {
  startPicking(transferId: string): Promise<Transfer> {
    return api.post<Transfer>(`/transfers/${transferId}/start-picking`)
  },
  setPickedQty(transferId: string, productId: string, pickedQty: number, reason?: string) {
    return api.post(`/transfers/${transferId}/picked-qty`, { productId, pickedQty, ...(reason ? { reason } : {}) })
  },
  /**
   * "Start Delivery." Turns the reservation into a real stock movement using
   * whatever was actually recorded via setPickedQty — see InventoryService
   * on the backend. There is no client-side inventory math here at all.
   */
  dispatch(transferId: string): Promise<Transfer> {
    return api.post<Transfer>(`/transfers/${transferId}/dispatch`)
  },
  markDelivered(transferId: string, items?: { productId: string; deliveredQty: number }[]): Promise<Transfer> {
    return api.post<Transfer>(`/transfers/${transferId}/deliver`, items ? { items } : undefined)
  },
  confirmReceipt(transferId: string): Promise<Transfer> {
    return api.post<Transfer>(`/transfers/${transferId}/confirm-receipt`)
  },
  fail(transferId: string, reason: string): Promise<Transfer> {
    return api.post<Transfer>(`/transfers/${transferId}/fail`, { reason })
  },
  retry(transferId: string, driverId?: string): Promise<Transfer> {
    return api.post<Transfer>(`/transfers/${transferId}/retry`, driverId ? { driverId } : undefined)
  },
}
