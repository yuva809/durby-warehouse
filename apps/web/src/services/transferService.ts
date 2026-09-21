import { useWarehouseStore } from '../store/useWarehouseStore'

export const transferService = {
  list() {
    return useWarehouseStore.getState().transfers
  },
  listForBranch(branchId: string) {
    return useWarehouseStore.getState().transfers.filter((t) => t.branchId === branchId)
  },
  get(transferId: string) {
    return useWarehouseStore.getState().transfers.find((t) => t.id === transferId)
  },
  getDrivers() {
    return useWarehouseStore.getState().drivers
  },
  assignDriver(transferId: string, driverId: string) {
    useWarehouseStore.getState().assignDriver(transferId, driverId)
  },
}
