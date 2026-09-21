import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, Check, Eye, Warehouse, Store, Truck } from 'lucide-react'
import { useWarehouseStore } from '../../store/useWarehouseStore'
import { ROLES, roleMeta } from '../../lib/viewRoles'
import { cn } from '../../lib/utils'
import type { ViewerRole } from '../../types'

const GROUP_ICON: Record<string, typeof Eye> = {
  Overview: Eye,
  Warehouse: Warehouse,
  Branches: Store,
  Delivery: Truck,
}

export function ViewSwitcher() {
  const view = useWarehouseStore((s) => s.view)
  const setView = useWarehouseStore((s) => s.setView)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const current = roleMeta(view)
  const groups: Record<string, typeof ROLES> = {}
  for (const r of ROLES) {
    groups[r.group] = groups[r.group] ? [...groups[r.group], r] : [r]
  }

  function choose(role: ViewerRole) {
    setView(role)
    setOpen(false)
    navigate('/')
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-[55vw] items-center gap-2 rounded-xl bg-ink-900 pl-1.5 pr-2.5 py-1.5 text-white hover:bg-ink-800 transition-colors cursor-pointer sm:max-w-none sm:gap-2.5 sm:pr-3"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-500/90">
          <Eye size={14} />
        </span>
        <span className="min-w-0 text-left leading-tight">
          <span className="hidden text-[10px] font-medium text-ink-400 sm:block">Viewing as</span>
          <span className="block truncate text-sm font-semibold">{current.label}</span>
        </span>
        <ChevronDown size={15} className={cn('shrink-0 text-ink-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(288px,88vw)] rounded-xl bg-white p-1.5 shadow-2xl ring-1 ring-ink-200 animate-slide-up" style={{ animationDuration: '0.15s' }}>
          {Object.entries(groups).map(([group, roles]) => {
            const Icon = GROUP_ICON[group]
            return (
              <div key={group} className="mb-1 last:mb-0">
                <div className="flex items-center gap-1.5 px-2.5 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                  <Icon size={11} /> {group}
                </div>
                {roles.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => choose(r.id)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition-colors cursor-pointer',
                      view === r.id ? 'bg-brand-50 text-brand-700 font-medium' : 'text-ink-700 hover:bg-ink-50',
                    )}
                  >
                    {r.label}
                    {view === r.id && <Check size={14} />}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
