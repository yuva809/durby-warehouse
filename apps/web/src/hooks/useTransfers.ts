import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { transferService } from '../services/transferService'
import { deliveryService } from '../services/deliveryService'

export function useTransfers() {
  return useQuery({ queryKey: ['transfers'], queryFn: transferService.list })
}

export function useTransfer(id: string | null) {
  return useQuery({
    queryKey: ['transfers', 'detail', id],
    queryFn: () => transferService.get(id!),
    enabled: !!id,
  })
}

/** Only managers/admins assign drivers, and only they may list users: everyone else must not even ask (it would 403). */
export function useDrivers(enabled = true) {
  return useQuery({ queryKey: ['drivers'], queryFn: transferService.getDrivers, enabled })
}

function invalidateTransfer(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['transfers'] })
  qc.invalidateQueries({ queryKey: ['activity'] })
}

function invalidateInventoryToo(qc: ReturnType<typeof useQueryClient>) {
  invalidateTransfer(qc)
  qc.invalidateQueries({ queryKey: ['inventory'] })
  qc.invalidateQueries({ queryKey: ['movements'] })
  qc.invalidateQueries({ queryKey: ['requests'] }) // request status mirrors transfer status
  qc.invalidateQueries({ queryKey: ['warehouse-availability'] }) // dispatch can release units that weren't picked
}

export function useAssignDriver() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, driverId }: { id: string; driverId: string }) => transferService.assignDriver(id, driverId),
    onSuccess: () => invalidateTransfer(qc),
  })
}

export function useSetEta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...eta }: { id: string; etaDate?: string; etaWindowStart?: string; etaWindowEnd?: string }) =>
      transferService.setEta(id, eta),
    onSuccess: () => invalidateTransfer(qc),
  })
}

export function useStartPicking() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deliveryService.startPicking,
    onSuccess: () => invalidateTransfer(qc),
  })
}

export function useSetPickedQty() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ transferId, productId, pickedQty, reason }: { transferId: string; productId: string; pickedQty: number; reason?: string }) =>
      deliveryService.setPickedQty(transferId, productId, pickedQty, reason),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['transfers', 'detail', vars.transferId] }),
  })
}

/** "Start Delivery" — releases the reservation and moves the picked quantity out of warehouse stock. */
export function useDispatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deliveryService.dispatch,
    onSuccess: () => invalidateInventoryToo(qc),
  })
}

export function useMarkDelivered() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ transferId, items }: { transferId: string; items?: { productId: string; deliveredQty: number }[] }) =>
      deliveryService.markDelivered(transferId, items),
    onSuccess: () => invalidateInventoryToo(qc),
  })
}

export function useConfirmReceipt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deliveryService.confirmReceipt,
    onSuccess: () => invalidateTransfer(qc),
  })
}

export function useFailDelivery() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ transferId, reason }: { transferId: string; reason: string }) => deliveryService.fail(transferId, reason),
    onSuccess: () => invalidateTransfer(qc),
  })
}

export function useRetryDelivery() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ transferId, driverId }: { transferId: string; driverId?: string }) => deliveryService.retry(transferId, driverId),
    onSuccess: () => invalidateTransfer(qc),
  })
}
