import { Card } from '../components/ui/Card'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { formatTime } from '../lib/utils'
import { ClipboardList, Eye, ArrowLeftRight, Truck, Boxes, Settings, type LucideIcon } from 'lucide-react'
import type { ActivityEvent } from '../types'

const KIND_META: Record<ActivityEvent['kind'], { icon: LucideIcon; className: string }> = {
  request: { icon: ClipboardList, className: 'bg-blue-50 text-blue-600' },
  review: { icon: Eye, className: 'bg-brand-50 text-brand-600' },
  transfer: { icon: ArrowLeftRight, className: 'bg-violet-50 text-violet-600' },
  delivery: { icon: Truck, className: 'bg-amber-50 text-amber-600' },
  inventory: { icon: Boxes, className: 'bg-emerald-50 text-emerald-600' },
  system: { icon: Settings, className: 'bg-ink-100 text-ink-500' },
}

export default function Activity() {
  const activity = useWarehouseStore((s) => s.activity)

  const groups = new Map<string, ActivityEvent[]>()
  for (const a of activity) {
    const day = new Date(a.timestamp).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long' })
    groups.set(day, [...(groups.get(day) ?? []), a])
  }

  return (
    <div className="space-y-6">
      {[...groups.entries()].map(([day, events]) => (
        <Card key={day} className="p-6">
          <h3 className="mb-5 font-display text-sm font-semibold uppercase tracking-wide text-ink-400">{day}</h3>
          <div className="space-y-0">
            {events.map((a, i) => {
              const meta = KIND_META[a.kind]
              const Icon = meta.icon
              return (
                <div key={a.id} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.className}`}>
                      <Icon size={14} />
                    </span>
                    {i !== events.length - 1 && <span className="w-px flex-1 min-h-[18px] bg-ink-100" />}
                  </div>
                  <div className="pb-5">
                    <div className="text-sm text-ink-800">{a.message}</div>
                    <div className="text-xs text-ink-400">{formatTime(a.timestamp)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      ))}
    </div>
  )
}
