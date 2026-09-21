import { useWarehouseStore } from '../store/useWarehouseStore'

export const activityService = {
  list() {
    return useWarehouseStore.getState().activity
  },
}
