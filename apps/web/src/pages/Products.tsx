import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, Package } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { ProductDrawer } from '../components/inventory/ProductDrawer'
import { useProducts, useLocations } from '../hooks/useCatalog'
import { useInventory } from '../hooks/useInventory'
import { STATUS_STYLES, formatCurrency, stockStatus } from '../lib/utils'
import type { StockStatus } from '../types'

export default function Products() {
  const { data: products = [] } = useProducts()
  const { data: locations = [] } = useLocations()
  const { data: inventoryLines = [] } = useInventory()
  const [query, setQuery] = useState('')
  const [params, setParams] = useSearchParams()

  const branches = locations.filter((l) => l.type === 'BRANCH')
  const byLocationProduct = useMemo(() => {
    const map = new Map<string, number>()
    for (const line of inventoryLines) map.set(`${line.locationId}:${line.productId}`, line.onHand)
    return map
  }, [inventoryLines])

  const filtered = useMemo(
    () => products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()) || p.sku.toLowerCase().includes(query.toLowerCase())),
    [products, query],
  )

  const openProduct = params.get('product')

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="relative max-w-sm">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products…"
            className="w-full rounded-lg bg-ink-50 py-2 pl-9 pr-3 text-sm text-ink-800 outline-none ring-1 ring-inset ring-ink-200 placeholder:text-ink-400 focus:ring-brand-400"
          />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((p) => {
          const total = locations.reduce((sum, l) => sum + (byLocationProduct.get(`${l.id}:${p.id}`) ?? 0), 0)
          const branchStatuses = branches.map((b) => stockStatus(byLocationProduct.get(`${b.id}:${p.id}`) ?? 0, p.minStock))
          const worst: StockStatus = branchStatuses.includes('out') ? 'out' : branchStatuses.includes('low') ? 'low' : 'healthy'
          return (
            <button
              key={p.id}
              onClick={() => setParams({ product: p.id })}
              className="group text-left"
            >
              <Card className="h-full p-5 transition-all group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:ring-brand-200 cursor-pointer">
                <div className="flex items-start justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <Package size={18} />
                  </span>
                  <Badge className={STATUS_STYLES[worst].badge} dot={STATUS_STYLES[worst].dot}>
                    {STATUS_STYLES[worst].label}
                  </Badge>
                </div>
                <div className="mt-3.5 font-display text-[15px] font-semibold text-ink-900">{p.name}</div>
                <div className="text-xs text-ink-400">{p.brand ? `${p.brand} · ` : ''}{p.category}</div>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Total Stock</div>
                    <div className="font-display text-lg font-bold text-ink-900 tabular-nums">
                      {total} <span className="text-xs font-medium text-ink-400">{p.unit}</span>
                    </div>
                  </div>
                  <div className="text-right text-xs text-ink-400">{formatCurrency(total * p.unitPrice)}</div>
                </div>
              </Card>
            </button>
          )
        })}
      </div>

      <ProductDrawer productId={openProduct} onClose={() => setParams({})} />
    </div>
  )
}
