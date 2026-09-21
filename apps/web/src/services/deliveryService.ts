import { useWarehouseStore } from '../store/useWarehouseStore'

export const deliveryService = {
  listActive() {
    return useWarehouseStore.getState().transfers.filter((t) => t.status !== 'ready')
  },
  startPicking(transferId: string) {
    useWarehouseStore.getState().startPicking(transferId)
  },
  setPickedQty(transferId: string, productId: string, qty: number) {
    useWarehouseStore.getState().setPickedQty(transferId, productId, qty)
  },
  startDelivery(transferId: string) {
    useWarehouseStore.getState().startDelivery(transferId)
  },
  markDelivered(transferId: string) {
    useWarehouseStore.getState().markDelivered(transferId)
  },
}
