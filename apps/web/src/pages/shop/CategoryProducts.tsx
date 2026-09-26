import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Minus, Plus, Search } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { useCategories, useWarehouseAvailability } from '../../hooks/useCatalog'
import { useCart } from '../../cart/CartContext'
import { cn } from '../../lib/utils'
import { CartBar } from './CartBar'

export default function ShopCategoryProducts() {
  const { categoryId } = useParams<{ categoryId: string }>()
  const [searchParams] = useSearchParams()
  const highlight = searchParams.get('highlight')
  const navigate = useNavigate()
  const { data: categories = [] } = useCategories()
  const isUncategorized = categoryId === 'uncategorized'
  const { data: products = [], isLoading } = useWarehouseAvailability(isUncategorized ? {} : { categoryId })
  const cart = useCart()
  const [query, setQuery] = useState('')
  const highlightRef = useRef<HTMLDivElement>(null)

  const category = categories.find((c) => c.id === categoryId)

  const visible = useMemo(() => {
    let list = isUncategorized ? products.filter((p) => !p.categoryId) : products
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter((p) => p.productName.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
    }
    return list
  }, [products, query, isUncategorized])

  useEffect(() => {
    if (highlight) highlightRef.current?.scrollIntoView({ block: 'center' })
  }, [highlight, visible.length])

  return (
    <div className="space-y-4 pb-20">
      <button onClick={() => navigate('/shop')} className="flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800 cursor-pointer">
        <ArrowLeft size={15} /> Back to categories
      </button>

      <div>
        <h1 className="font-display text-xl font-bold text-ink-900">{isUncategorized ? 'Other Products' : category?.name ?? 'Products'}</h1>
        <p className="text-sm text-ink-500 mt-0.5">Add the quantities you need — you can adjust everything before submitting.</p>
      </div>

      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter within this category…"
          className="w-full rounded-lg bg-white py-2.5 pl-9 pr-3 text-sm text-ink-800 outline-none ring-1 ring-inset ring-ink-200 placeholder:text-ink-400 focus:ring-brand-400"
        />
      </div>

      {isLoading && <EmptyState title="Loading products…" />}
      {!isLoading && visible.length === 0 && <EmptyState icon={<Search size={20} />} title="No products found" />}

      <div className="space-y-2">
        {visible.map((p) => {
          const qty = cart.items[p.productId] ?? 0
          const isHighlighted = p.productId === highlight
          return (
            <div key={p.productId} ref={isHighlighted ? highlightRef : undefined}>
            <Card
              className={cn('flex items-center justify-between gap-3 p-4', isHighlighted && 'ring-2 ring-brand-400')}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink-800">{p.productName}</div>
                <div className="text-xs text-ink-400">
                  {p.sku} · <span className={p.availableQuantity > 0 ? 'text-emerald-600' : 'text-rose-500'}>{p.availableQuantity} {p.unit} available</span>
                </div>
              </div>
              {qty === 0 ? (
                <button
                  onClick={() => cart.setQty(p.productId, 1)}
                  className="shrink-0 rounded-lg bg-brand-50 px-3.5 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-100 cursor-pointer"
                >
                  Add
                </button>
              ) : (
                <div className="flex shrink-0 items-center gap-1.5 rounded-lg bg-ink-50 p-1">
                  <button onClick={() => cart.setQty(p.productId, qty - 1)} className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-100 cursor-pointer">
                    <Minus size={13} />
                  </button>
                  <span className="w-8 text-center text-sm font-semibold tabular-nums">{qty}</span>
                  <button onClick={() => cart.setQty(p.productId, qty + 1)} className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-100 cursor-pointer">
                    <Plus size={13} />
                  </button>
                </div>
              )}
            </Card>
            </div>
          )
        })}
      </div>

      <CartBar />
    </div>
  )
}
