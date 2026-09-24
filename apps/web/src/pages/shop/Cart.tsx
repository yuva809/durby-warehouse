import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Minus, Plus, ShoppingCart, X, AlertTriangle } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { useWarehouseAvailability } from '../../hooks/useCatalog'
import { useSubmitRequest } from '../../hooks/useRequests'
import { useCart } from '../../cart/CartContext'

export default function ShopCart() {
  const navigate = useNavigate()
  const cart = useCart()
  const { data: products = [] } = useWarehouseAvailability()
  const byId = useMemo(() => new Map(products.map((p) => [p.productId, p])), [products])
  const submit = useSubmitRequest()
  const [submittedOc, setSubmittedOc] = useState<string | null>(null)

  const lines = Object.entries(cart.items)
    .map(([productId, qty]) => ({ product: byId.get(productId), qty }))
    .filter((l): l is { product: NonNullable<typeof l.product>; qty: number } => !!l.product)

  async function handleSubmit() {
    const items = lines.map((l) => ({ productId: l.product.productId, requestedQty: l.qty }))
    if (items.length === 0) return
    const request = await submit.mutateAsync(items)
    setSubmittedOc(request.ocNumber)
    cart.clear()
  }

  if (submittedOc) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <CheckCircle2 size={32} />
        </div>
        <h3 className="mt-4 font-display text-xl font-bold text-ink-900">Order Submitted</h3>
        <div className="mt-1 font-display text-lg font-semibold text-brand-600">{submittedOc}</div>
        <p className="mt-2 max-w-xs text-sm text-ink-500">Your order has been sent to the warehouse manager for approval.</p>
        <Badge className="mt-4 bg-ink-100 text-ink-600 ring-ink-500/10">Status: Pending Review</Badge>
        <div className="mt-8 flex gap-2">
          <Button variant="outline" onClick={() => navigate('/shop')}>Continue Browsing</Button>
          <Button onClick={() => navigate('/requests')}>View My Orders</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-6">
      <button onClick={() => navigate('/shop')} className="flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800 cursor-pointer">
        <ArrowLeft size={15} /> Continue browsing
      </button>

      <h1 className="font-display text-xl font-bold text-ink-900">Your Order Cart</h1>

      {lines.length === 0 ? (
        <EmptyState icon={<ShoppingCart size={20} />} title="Your cart is empty" subtitle="Browse categories or search to add products." />
      ) : (
        <div className="space-y-2">
          {lines.map(({ product, qty }) => {
            const exceeds = qty > product.availableQuantity
            return (
              <Card key={product.productId} className="p-4">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink-800">{product.productName}</div>
                    <div className="text-xs text-ink-400">{product.category}</div>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-lg bg-ink-50 p-1">
                    <button onClick={() => cart.setQty(product.productId, qty - 1)} className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-100 cursor-pointer">
                      <Minus size={13} />
                    </button>
                    <span className="w-8 text-center text-sm font-semibold tabular-nums">{qty}</span>
                    <button onClick={() => cart.setQty(product.productId, qty + 1)} className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-100 cursor-pointer">
                      <Plus size={13} />
                    </button>
                  </div>
                  <span className="w-12 shrink-0 text-xs text-ink-400">{product.unit}</span>
                  <button onClick={() => cart.removeItem(product.productId)} className="text-ink-300 hover:text-rose-500 cursor-pointer">
                    <X size={16} />
                  </button>
                </div>
                <div className={exceeds ? 'mt-1.5 text-[11px] text-amber-600' : 'mt-1.5 text-[11px] text-ink-400'}>
                  Available from warehouse: {product.availableQuantity} {product.unit}
                  {exceeds && ' — may be partially approved'}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {submit.isError && (
        <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <AlertTriangle size={14} className="shrink-0" /> {(submit.error as Error).message}
        </div>
      )}

      <Button className="w-full" size="lg" disabled={lines.length === 0 || submit.isPending} onClick={handleSubmit}>
        {submit.isPending ? 'Submitting…' : `Submit Order (${lines.length})`}
      </Button>
    </div>
  )
}
