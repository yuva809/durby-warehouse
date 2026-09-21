import { api } from '../lib/apiClient'
import type { Driver, Transfer } from '../types'

export const transferService = {
  list(): Promise<Transfer[]> {
    return api.get<Transfer[]>('/transfers')
  },
  get(id: string): Promise<Transfer> {
    return api.get<Transfer>(`/transfers/${id}`)
  },
  getDrivers(): Promise<Driver[]> {
    return api.get<Driver[]>('/users?role=DRIVER')
  },
  assignDriver(id: string, driverId: string): Promise<Transfer> {
    return api.post<Transfer>(`/transfers/${id}/assign-driver`, { driverId })
  },
  setEta(id: string, eta: { etaDate?: string; etaWindowStart?: string; etaWindowEnd?: string }): Promise<Transfer> {
    return api.post<Transfer>(`/transfers/${id}/eta`, eta)
  },
}
