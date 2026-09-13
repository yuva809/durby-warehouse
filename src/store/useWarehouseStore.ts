import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  DRIVERS,
  INITIAL_ACTIVITY,
  INITIAL_INVENTORY,
  INITIAL_REQUESTS,
  INITIAL_TRANSFERS,
  LOCATIONS,
  PRODUCTS,
} from '../data/seed'
import type {
  ActivityEvent,
  Driver,
  InventoryMap,
  Location,
  Product,
  RequestItem,
  StockRequest,
  Transfer,
  ViewerRole,
} from '../types'
import { WAREHOUSE_ID } from '../types'

const STORE_VERSION = 6

interface RequestDraftItem {
  productId: string
  requestedQty: number
}

interface WarehouseState {
  products: Product[]
  locations: Location[]
  drivers: Driver[]
  inventory: InventoryMap
  requests: StockRequest[]
  transfers: Transfer[]
  activity: ActivityEvent[]
  view: ViewerRole
  nextRequestNum: number
  nextTransferNum: number

  setView: (view: ViewerRole) => void
  resetDemo: () => void

  submitRequest: (branchId: string, items: RequestDraftItem[]) => string
  markReviewing: (requestId: string) => void
  updateApprovedQty: (requestId: string, productId: string, qty: number) => void
  approveRequest: (requestId: string) => string | undefined
  rejectRequest: (requestId: string, reason: string) => void

  assignDriver: (transferId: string, driverId: string) => void
  startPicking: (transferId: string) => void
  setPickedQty: (transferId: string, productId: string, qty: number) => void
  startDelivery: (transferId: string) => void
  markDelivered: (transferId: string) => void
}

function logEvent(message: string, kind: ActivityEvent['kind']): ActivityEvent {
  return {
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    message,
    kind,
  }
}

function branchLabel(branchId: string) {
  return LOCATIONS.find((l) => l.id === branchId)?.name ?? branchId
}

function productLabel(productId: string) {
  return PRODUCTS.find((p) => p.id === productId)?.name ?? productId
}

const seedState = () => ({
  products: PRODUCTS,
  locations: LOCATIONS,
  drivers: DRIVERS,
  inventory: structuredClone(INITIAL_INVENTORY),
  requests: structuredClone(INITIAL_REQUESTS),
  transfers: structuredClone(INITIAL_TRANSFERS),
  activity: structuredClone(INITIAL_ACTIVITY),
  view: 'overview' as ViewerRole,
  nextRequestNum: 1024,
  nextTransferNum: 1024,
})

export const useWarehouseStore = create<WarehouseState>()(
  persist(
    (set, get) => ({
      ...seedState(),

      setView: (view) => set({ view }),

      resetDemo: () => set({ ...seedState() }),

      submitRequest: (branchId, items) => {
        const id = `REQ-${get().nextRequestNum}`
        const request: StockRequest = {
          id,
          branchId,
          status: 'pending',
          createdAt: new Date().toISOString(),
          items: items.map((i) => ({ productId: i.productId, requestedQty: i.requestedQty })),
        }
        set((s) => ({
          requests: [request, ...s.requests],
          nextRequestNum: s.nextRequestNum + 1,
          activity: [
            logEvent(
              `${branchLabel(branchId)} submitted ${id} (${items.length} product${items.length === 1 ? '' : 's'})`,
              'request',
            ),
            ...s.activity,
          ],
        }))
        return id
      },

      markReviewing: (requestId) => {
        set((s) => ({
          requests: s.requests.map((r) =>
            r.id === requestId && r.status === 'pending' ? { ...r, status: 'reviewing' } : r,
          ),
        }))
      },

      updateApprovedQty: (requestId, productId, qty) => {
        set((s) => ({
          requests: s.requests.map((r) => {
            if (r.id !== requestId) return r
            return {
              ...r,
              items: r.items.map((it) => (it.productId === productId ? { ...it, approvedQty: qty } : it)),
            }
          }),
          activity: [
            logEvent(
              `${productLabel(productId)} quantity adjusted for ${requestId}: approved ${qty}`,
              'review',
            ),
            ...s.activity,
          ],
        }))
      },

      approveRequest: (requestId) => {
        const state = get()
        const request = state.requests.find((r) => r.id === requestId)
        if (!request) return undefined

        const resolvedItems: RequestItem[] = request.items.map((it) => ({
          ...it,
          approvedQty: it.approvedQty ?? it.requestedQty,
        }))

        const transferId = `TR-${state.nextTransferNum}`
        const transfer: Transfer = {
          id: transferId,
          requestId,
          branchId: request.branchId,
          status: 'ready',
          createdAt: new Date().toISOString(),
          items: resolvedItems.map((it) => ({ productId: it.productId, qty: it.approvedQty ?? 0 })),
        }

        const newInventory: InventoryMap = structuredClone(state.inventory)
        for (const item of resolvedItems) {
          const qty = item.approvedQty ?? 0
          const current = newInventory[WAREHOUSE_ID][item.productId] ?? 0
          newInventory[WAREHOUSE_ID][item.productId] = Math.max(0, current - qty)
        }

        set((s) => ({
          inventory: newInventory,
          requests: s.requests.map((r) => (r.id === requestId ? { ...r, items: resolvedItems, status: 'approved', reviewedAt: new Date().toISOString() } : r)),
          transfers: [transfer, ...s.transfers],
          nextTransferNum: s.nextTransferNum + 1,
          activity: [
            logEvent(`Transfer ${transferId} created for ${branchLabel(request.branchId)}`, 'transfer'),
            logEvent(`Warehouse Manager approved ${requestId}`, 'review'),
            ...s.activity,
          ],
        }))

        return transferId
      },

      rejectRequest: (requestId, reason) => {
        set((s) => ({
          requests: s.requests.map((r) =>
            r.id === requestId ? { ...r, status: 'rejected', rejectionReason: reason, reviewedAt: new Date().toISOString() } : r,
          ),
          activity: [logEvent(`Warehouse Manager rejected ${requestId}`, 'review'), ...s.activity],
        }))
      },

      assignDriver: (transferId, driverId) => {
        const driver = get().drivers.find((d) => d.id === driverId)
        set((s) => ({
          transfers: s.transfers.map((t) => (t.id === transferId ? { ...t, driverId, status: 'assigned' } : t)),
          activity: [logEvent(`Driver ${driver?.name ?? driverId} assigned to ${transferId}`, 'transfer'), ...s.activity],
        }))
      },

      startPicking: (transferId) => {
        set((s) => ({
          transfers: s.transfers.map((t) =>
            t.id === transferId
              ? { ...t, status: 'picking', items: t.items.map((it) => ({ ...it, pickedQty: 0 })) }
              : t,
          ),
          activity: [logEvent(`Driver started picking for ${transferId}`, 'delivery'), ...s.activity],
        }))
      },

      setPickedQty: (transferId, productId, qty) => {
        set((s) => ({
          transfers: s.transfers.map((t) => {
            if (t.id !== transferId) return t
            return { ...t, items: t.items.map((it) => (it.productId === productId ? { ...it, pickedQty: qty } : it)) }
          }),
        }))
      },

      startDelivery: (transferId) => {
        set((s) => ({
          transfers: s.transfers.map((t) => (t.id === transferId ? { ...t, status: 'out_for_delivery' } : t)),
          activity: [logEvent(`${transferId} is out for delivery`, 'delivery'), ...s.activity],
        }))
      },

      markDelivered: (transferId) => {
        const state = get()
        const transfer = state.transfers.find((t) => t.id === transferId)
        if (!transfer) return

        const newInventory: InventoryMap = structuredClone(state.inventory)
        for (const item of transfer.items) {
          const current = newInventory[transfer.branchId]?.[item.productId] ?? 0
          newInventory[transfer.branchId][item.productId] = current + item.qty
        }

        set((s) => ({
          inventory: newInventory,
          transfers: s.transfers.map((t) =>
            t.id === transferId ? { ...t, status: 'delivered', deliveredAt: new Date().toISOString() } : t,
          ),
          requests: s.requests.map((r) => (r.id === transfer.requestId ? { ...r, status: 'delivered' } : r)),
          activity: [
            logEvent(`${branchLabel(transfer.branchId)} inventory updated from ${transferId}`, 'inventory'),
            logEvent(`${transferId} delivered to ${branchLabel(transfer.branchId)}`, 'delivery'),
            ...s.activity,
          ],
        }))
      },
    }),
    {
      name: 'durby-warehouse-demo',
      version: STORE_VERSION,
      migrate: () => seedState() as WarehouseState,
    },
  ),
)
