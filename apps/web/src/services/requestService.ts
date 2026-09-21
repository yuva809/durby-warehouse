import { api } from '../lib/apiClient'
import type { RequestStatus, StockRequest, Transfer } from '../types'

export const requestService = {
  list(status?: RequestStatus): Promise<StockRequest[]> {
    return api.get<StockRequest[]>(`/requests${status ? `?status=${status}` : ''}`)
  },
  get(id: string): Promise<StockRequest> {
    return api.get<StockRequest>(`/requests/${id}`)
  },
  submit(items: { productId: string; requestedQty: number }[]): Promise<StockRequest> {
    return api.post<StockRequest>('/requests', { items })
  },
  markReviewing(id: string): Promise<StockRequest> {
    return api.post<StockRequest>(`/requests/${id}/review`)
  },
  updateApprovedQty(id: string, productId: string, approvedQty: number): Promise<StockRequest> {
    return api.patch<StockRequest>(`/requests/${id}/items`, { productId, approvedQty })
  },
  approve(id: string): Promise<Transfer> {
    return api.post<Transfer>(`/requests/${id}/approve`)
  },
  reject(id: string, reason: string): Promise<StockRequest> {
    return api.post<StockRequest>(`/requests/${id}/reject`, { reason })
  },
  cancel(id: string): Promise<StockRequest> {
    return api.post<StockRequest>(`/requests/${id}/cancel`)
  },
}
