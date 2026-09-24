import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

/**
 * The in-progress branch order draft — genuinely client/UI state (nothing
 * server-side exists until the branch submits, same as RequestStockDrawer's
 * old local `selected` state), so this stays plain React state rather than
 * adding a second Zustand store (see authStore.ts's "only store left"
 * comment). Lives above the router so it survives navigating between the
 * category grid, a category's product list, and the cart review screen.
 */
interface CartContextValue {
  items: Record<string, number>
  setQty: (productId: string, qty: number) => void
  removeItem: (productId: string) => void
  clear: () => void
  totalCount: number
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Record<string, number>>({})

  const setQty = (productId: string, qty: number) => {
    setItems((prev) => {
      if (qty <= 0) {
        const next = { ...prev }
        delete next[productId]
        return next
      }
      return { ...prev, [productId]: qty }
    })
  }

  const removeItem = (productId: string) =>
    setItems((prev) => {
      const next = { ...prev }
      delete next[productId]
      return next
    })

  const clear = () => setItems({})

  const totalCount = useMemo(() => Object.keys(items).length, [items])

  return <CartContext.Provider value={{ items, setQty, removeItem, clear, totalCount }}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within a CartProvider')
  return ctx
}
