import { Check, Boxes, Warehouse, Truck, Sparkles, Network } from 'lucide-react'
import { Card } from '../components/ui/Card'
import type { LucideIcon } from 'lucide-react'

interface RoadmapSection {
  title: string
  icon: LucideIcon
  accent: string
  shipped?: string[]
  comingSoon: string[]
}

const SECTIONS: RoadmapSection[] = [
  {
    title: 'Inventory',
    icon: Boxes,
    accent: 'from-brand-500 to-brand-700',
    shipped: ['Multi-location inventory', 'Stock requests', 'Stock transfers'],
    comingSoon: ['Barcode scanning', 'Batch & expiry tracking', 'Stock counting', 'Stock adjustments', 'Automatic low-stock alerts'],
  },
  {
    title: 'Warehouse',
    icon: Warehouse,
    accent: 'from-indigo-500 to-indigo-700',
    comingSoon: ['Purchase orders', 'Supplier management', 'Goods receiving', 'Automated replenishment'],
  },
  {
    title: 'Delivery',
    icon: Truck,
    accent: 'from-amber-500 to-amber-700',
    comingSoon: ['Driver mobile app', 'Route optimization', 'GPS tracking', 'Proof of delivery', 'Digital signature'],
  },
  {
    title: 'Intelligence',
    icon: Sparkles,
    accent: 'from-emerald-500 to-emerald-700',
    comingSoon: ['Branch consumption analytics', 'Demand forecasting', 'Smart reorder recommendations', 'AI inventory assistant'],
  },
  {
    title: 'Asia Might Platform',
    icon: Network,
    accent: 'from-rose-500 to-rose-700',
    comingSoon: ['Restaurant integration', 'Multiple warehouses', 'Centralized product management', 'Finance / accounting integration'],
  },
]

export default function Roadmap() {
  return (
    <div className="space-y-6">
      <Card className="overflow-hidden bg-gradient-to-br from-ink-950 to-ink-800 p-8 text-white">
        <div className="max-w-2xl">
          <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-brand-200">
            V1 Prototype → V2 Platform
          </span>
          <h2 className="mt-4 font-display text-2xl font-bold">This is the foundation, not the finish line.</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-300">
            What you're using today proves the core loop: one warehouse, five branches, one connected flow from
            request to delivery. Everything below is what we build next once the concept is approved.
          </p>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {SECTIONS.map((section) => (
          <Card key={section.title} className="p-6">
            <div className="flex items-center gap-3">
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${section.accent} text-white shadow-md`}>
                <section.icon size={18} />
              </span>
              <h3 className="font-display text-lg font-bold text-ink-900">{section.title}</h3>
            </div>

            {section.shipped && (
              <div className="mt-4 space-y-2">
                {section.shipped.map((s) => (
                  <div key={s} className="flex items-center gap-2 text-sm text-ink-700">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                      <Check size={11} />
                    </span>
                    {s}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Coming Soon</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {section.comingSoon.map((c) => (
                  <span key={c} className="rounded-lg bg-ink-50 px-2.5 py-1.5 text-xs font-medium text-ink-600 ring-1 ring-inset ring-ink-200/70">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
