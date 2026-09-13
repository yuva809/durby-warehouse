import { useMemo, useState } from 'react'
import { Search, Plus, X, CheckCircle2, ClipboardList } from 'lucide-react'
import { Drawer } from '../ui/Drawer'
import { Button } from '../ui/Button'
import { useWarehouseStore } from '../../store/useWarehouseStore'
import { requestService } from '../../services/requestService'
import { STATUS_STYLES, stockStatus } from '../../lib/utils'
import { Badge } from '../ui/Badge'

export function RequestStockDrawer({
  branchId,
  open,
  onClose,
}: {
  branchId: string
  open: boolean
  onClose: () => void
}) {
  const products = useWarehouseStore((s) => s.products)
  const inventory = useWarehouseStore((s) => s.inventory)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Record<string, number>>({})
  const [submittedId, setSubmittedId] = useState<string | null>(null)

  function reset() {
    setQuery('')
    setSelected({})
    setSubmittedId(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  const branchQty = (productId: string) => inventory[branchId]?.[productId] ?? 0

  const results = useMemo(
    () =>
      products
        .filter((p) => !selected[p.id])
        .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 8),
    [products, query, selected],
  )

  function addProduct(productId: string) {
    const product = products.find((p) => p.id === productId)!
    const current = branchQty(productId)
    const suggested = Math.max(product.minStock - current, product.unit === 'kg' || product.unit === 'liter' ? 10 : 5)
    setSelected((s) => ({ ...s, [productId]: suggested }))
    setQuery('')
  }

  function removeProduct(productId: string) {
    setSelected((s) => {
      const next = { ...s }
      delete next[productId]
      return next
    })
  }

  function setQty(productId: string, qty: number) {
    setSelected((s) => ({ ...s, [productId]: Math.max(0, qty) }))
  }

  function submit() {
    const items = Object.entries(selected).map(([productId, requestedQty]) => ({ productId, requestedQty }))
    if (items.length === 0) return
    const id = requestService.submit(branchId, items)
    setSubmittedId(id)
  }

  const selectedIds = Object.keys(selected)

  if (submittedId) {
    return (
      <Drawer open={open} onClose={handleClose} title="Request Stock">
        <div className="flex flex-col items-center py-10 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 size={32} />
          </div>
          <h3 className="mt-4 font-display text-xl font-bold text-ink-900">Request Submitted</h3>
          <div className="mt-1 font-display text-lg font-semibold text-brand-600">{submittedId}</div>
          <p className="mt-2 max-w-xs text-sm text-ink-500">
            Your request has been sent to the warehouse manager.
          </p>
          <Badge className="mt-4 bg-ink-100 text-ink-600 ring-ink-500/10">Status: Pending Review</Badge>
          <Button className="mt-8 w-full" onClick={handleClose}>
            Done
          </Button>
        </div>
      </Drawer>
    )
  }

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      title="Request Stock"
      subtitle="Search products and add the quantities you need"
      footer={
        <Button className="w-full" size="lg" disabled={selectedIds.length === 0} onClick={submit}>
          <ClipboardList size={16} /> Submit Request {selectedIds.length > 0 && `(${selectedIds.length})`}
        </Button>
      }
    >
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products…"
          className="w-full rounded-lg bg-ink-50 py-2.5 pl-9 pr-3 text-sm text-ink-800 outline-none ring-1 ring-inset ring-ink-200 placeholder:text-ink-400 focus:ring-brand-400"
        />
      </div>

      {query && results.length > 0 && (
        <div className="mt-2 divide-y divide-ink-50 overflow-hidden rounded-xl ring-1 ring-ink-200/70">
          {results.map((p) => {
            const qty = branchQty(p.id)
            const status = stockStatus(qty, p.minStock)
            return (
              <button
                key={p.id}
                onClick={() => addProduct(p.id)}
                className="flex w-full items-center justify-between bg-white px-3.5 py-2.5 text-left hover:bg-brand-50/50 cursor-pointer"
              >
                <div>
                  <div className="text-sm font-medium text-ink-800">{p.name}</div>
                  <div className="text-xs text-ink-400">Current stock: {qty} {p.unit}</div>
                </div>
                <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${STATUS_STYLES[status].badge}`}>
                  <Plus size={14} />
                </span>
              </button>
            )
          })}
        </div>
      )}

      <div className="mt-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-400">
          {selectedIds.length === 0 ? 'No products added yet' : `${selectedIds.length} Product${selectedIds.length === 1 ? '' : 's'} Added`}
        </div>
        <div className="mt-2 space-y-2">
          {selectedIds.map((id) => {
            const product = products.find((p) => p.id === id)!
            return (
              <div key={id} className="flex items-center gap-3 rounded-xl ring-1 ring-ink-200/70 p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink-800">{product.name}</div>
                  <div className="text-xs text-ink-400">Current stock: {branchQty(id)} {product.unit}</div>
                </div>
                <input
                  type="number"
                  min={1}
                  value={selected[id]}
                  onChange={(e) => setQty(id, Number(e.target.value))}
                  className="w-20 rounded-lg bg-ink-50 px-2 py-1.5 text-right text-sm font-semibold tabular-nums outline-none ring-1 ring-inset ring-ink-200 focus:ring-brand-400"
                />
                <span className="w-12 shrink-0 text-xs text-ink-400">{product.unit}</span>
                <button onClick={() => removeProduct(id)} className="text-ink-300 hover:text-rose-500 cursor-pointer">
                  <X size={16} />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </Drawer>
  )
}
