import { useWarehouseStore } from '../store/useWarehouseStore'

export const requestService = {
  list() {
    return useWarehouseStore.getState().requests
  },
  listForBranch(branchId: string) {
    return useWarehouseStore.getState().requests.filter((r) => r.branchId === branchId)
  },
  get(requestId: string) {
    return useWarehouseStore.getState().requests.find((r) => r.id === requestId)
  },
  submit(branchId: string, items: { productId: string; requestedQty: number }[]) {
    return useWarehouseStore.getState().submitRequest(branchId, items)
  },
  markReviewing(requestId: string) {
    useWarehouseStore.getState().markReviewing(requestId)
  },
  updateApprovedQty(requestId: string, productId: string, qty: number) {
    useWarehouseStore.getState().updateApprovedQty(requestId, productId, qty)
  },
  approve(requestId: string) {
    return useWarehouseStore.getState().approveRequest(requestId)
  },
  reject(requestId: string, reason: string) {
    useWarehouseStore.getState().rejectRequest(requestId, reason)
  },
}
