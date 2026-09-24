import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ChevronRight, Boxes } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { ProductThumb } from '../../components/ui/ProductThumb'
import { useCategories, useWarehouseAvailability } from '../../hooks/useCatalog'
import { useCart } from '../../cart/CartContext'
import { cn } from '../../lib/utils'
import { CartBar } from './CartBar'

export default function ShopCategories() {
  const navigate = useNavigate()
  const { data: categories = [], isLoading } = useCategories()
  const [query, setQuery] = useState('')
  const { data: searchResults = [] } = useWarehouseAvailability(query.trim() ? { search: query.trim() } : {})
  const cart = useCart()

  const visibleCategories = useMemo(() => categories.filter((c) => c.active && (c.productCount ?? 0) > 0), [categories])

  return (
    <div className="space-y-5 pb-20">
      <div>
        <h1 className="font-display text-xl font-bold text-ink-900">Inventory</h1>
        <p className="text-sm text-ink-500 mt-0.5">Browse by category or search for a product to request from the warehouse.</p>
      </div>

      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products by name, code, or category…"
          className="w-full rounded-xl bg-white py-3 pl-9 pr-3 text-sm text-ink-800 outline-none ring-1 ring-inset ring-ink-200 placeholder:text-ink-400 focus:ring-brand-400"
        />
      </div>

      {query.trim() ? (
        <div className="space-y-2">
          {searchResults.length === 0 && (
            <EmptyState icon={<Search size={20} />} title="No products found" subtitle={`Nothing matched "${query.trim()}"`} />
          )}
          {searchResults.map((p) => (
            <Card
              key={p.productId}
              className="flex cursor-pointer items-center justify-between p-4 hover:ring-brand-300"
              onClick={() => navigate(`/shop/${p.categoryId ?? 'uncategorized'}?highlight=${p.productId}`)}
            >
              <div className="flex min-w-0 items-center gap-3">
                <ProductThumb src={p.image?.imageUrl} size={40} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink-800">{p.productName}</div>
                  <div className="text-xs text-ink-400">
                    {p.category} · {p.sku}
                    {cart.items[p.productId] && <span className="ml-2 text-brand-600 font-medium">In cart · {cart.items[p.productId]} {p.unit}</span>}
                  </div>
                </div>
              </div>
              <span className={cn('shrink-0 text-xs font-medium', p.availableQuantity > 0 ? 'text-emerald-600' : 'text-rose-500')}>
                {p.availableQuantity} {p.unit} available
              </span>
            </Card>
          ))}
        </div>
      ) : (
        <>
          {isLoading && <EmptyState icon={<Boxes size={20} />} title="Loading categories…" />}
          {!isLoading && visibleCategories.length === 0 && (
            <EmptyState icon={<Boxes size={20} />} title="No categories yet" subtitle="Ask the warehouse manager to set up product categories." />
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visibleCategories.map((c) => (
              <Card
                key={c.id}
                className="flex cursor-pointer flex-col gap-2 p-4 hover:ring-brand-300 transition-shadow hover:shadow-md"
                onClick={() => navigate(`/shop/${c.id}`)}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Boxes size={18} />
                </div>
                <div>
                  <div className="font-medium text-ink-800 text-sm">{c.name}</div>
                  <div className="text-xs text-ink-400 mt-0.5 flex items-center gap-1">
                    {c.productCount} product{c.productCount === 1 ? '' : 's'}
                    <ChevronRight size={12} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <CartBar />
    </div>
  )
}
