import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { ProductDrawer } from '../components/inventory/ProductDrawer'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { STATUS_STYLES, cn, stockStatus } from '../lib/utils'
import { WAREHOUSE_ID, BRANCH_IDS, type StockStatus } from '../types'

export default function Inventory() {
  const products = useWarehouseStore((s) => s.products)
  const locations = useWarehouseStore((s) => s.locations)
  const inventory = useWarehouseStore((s) => s.inventory)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [params, setParams] = useSearchParams()

  const categories = useMemo(() => ['All', ...Array.from(new Set(products.map((p) => p.category)))], [products])

  const branches = locations.filter((l) => BRANCH_IDS.includes(l.id as (typeof BRANCH_IDS)[number]))

  const rows = useMemo(() => {
    return products
      .filter((p) => (category === 'All' ? true : p.category === category))
      .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()) || p.sku.toLowerCase().includes(query.toLowerCase()))
      .map((p) => {
        const total = locations.reduce((sum, l) => sum + (inventory[l.id]?.[p.id] ?? 0), 0)
        const branchStatuses = branches.map((b) => stockStatus(inventory[b.id]?.[p.id] ?? 0, p.minStock))
        const worst: StockStatus = branchStatuses.includes('out') ? 'out' : branchStatuses.includes('low') ? 'low' : 'healthy'
        const lowBranch = branches.find((_b, i) => branchStatuses[i] !== 'healthy')
        return { product: p, total, worst, lowBranch }
      })
  }, [products, category, query, locations, inventory, branches])

  const openProduct = params.get('product')

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by product name or SKU…"
            className="w-full rounded-lg bg-ink-50 py-2 pl-9 pr-3 text-sm text-ink-800 outline-none ring-1 ring-inset ring-ink-200 placeholder:text-ink-400 focus:ring-brand-400"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer',
                category === c ? 'bg-ink-900 text-white' : 'bg-ink-50 text-ink-600 hover:bg-ink-100',
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1300px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/60 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
                <th className="px-5 py-3 font-semibold">Product</th>
                <th className="px-3 py-3 font-semibold">Article No.</th>
                <th className="px-3 py-3 font-semibold">Category</th>
                <th className="px-3 py-3 font-semibold">Pack</th>
                <th className="px-3 py-3 text-right font-semibold">Warehouse</th>
                {branches.map((b) => (
                  <th key={b.id} className="px-3 py-3 text-right font-semibold">
                    {b.name}
                  </th>
                ))}
                <th className="px-3 py-3 text-right font-semibold">Total</th>
                <th className="px-5 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ product, total, worst, lowBranch }) => (
                <tr
                  key={product.id}
                  onClick={() => setParams({ product: product.id })}
                  className="cursor-pointer border-b border-ink-50 last:border-0 hover:bg-brand-50/40"
                >
                  <td className="px-5 py-3 whitespace-nowrap">
                    <div className="font-medium text-ink-900">{product.name}</div>
                    {product.brand && <div className="text-xs text-ink-400">{product.brand}</div>}
                  </td>
                  <td className="px-3 py-3 text-ink-500 whitespace-nowrap">{product.sku}</td>
                  <td className="px-3 py-3 text-ink-500 whitespace-nowrap">{product.category}</td>
                  <td className="px-3 py-3 text-ink-500 whitespace-nowrap">{product.pack ?? '—'}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-ink-700 whitespace-nowrap">
                    {inventory[WAREHOUSE_ID]?.[product.id] ?? 0} {product.unit}
                  </td>
                  {branches.map((b) => {
                    const qty = inventory[b.id]?.[product.id] ?? 0
                    const status = stockStatus(qty, product.minStock)
                    return (
                      <td
                        key={b.id}
                        className={cn(
                          'px-3 py-3 text-right tabular-nums whitespace-nowrap',
                          status === 'healthy' ? 'text-ink-700' : status === 'low' ? 'text-amber-600 font-semibold' : 'text-rose-600 font-semibold',
                        )}
                      >
                        {qty}
                      </td>
                    )
                  })}
                  <td className="px-3 py-3 text-right tabular-nums font-semibold text-ink-900 whitespace-nowrap">
                    {total} {product.unit}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    {worst === 'healthy' ? (
                      <Badge className={STATUS_STYLES.healthy.badge} dot={STATUS_STYLES.healthy.dot}>
                        Healthy
                      </Badge>
                    ) : (
                      <Badge className={STATUS_STYLES[worst].badge} dot={STATUS_STYLES[worst].dot}>
                        {STATUS_STYLES[worst].label}{lowBranch ? ` at ${lowBranch.name}` : ''}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <ProductDrawer productId={openProduct} onClose={() => setParams({})} />
    </div>
  )
}
