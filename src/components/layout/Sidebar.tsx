import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Boxes,
  Package,
  Store,
  ClipboardList,
  ArrowLeftRight,
  Truck,
  Activity,
  Map,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { LogoMark } from './LogoMark'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/inventory', label: 'Inventory', icon: Boxes },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/branches', label: 'Branches', icon: Store },
  { to: '/requests', label: 'Stock Requests', icon: ClipboardList },
  { to: '/transfers', label: 'Transfers', icon: ArrowLeftRight },
  { to: '/deliveries', label: 'Deliveries', icon: Truck },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/roadmap', label: 'Roadmap', icon: Map },
]

export function Sidebar() {
  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col bg-ink-950 text-ink-200">
      <div className="flex items-center gap-2.5 px-6 py-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white p-1.5 shadow-lg shadow-black/20">
          <LogoMark className="h-full w-full" />
        </div>
        <div>
          <div className="font-display text-lg font-extrabold tracking-tight text-white leading-none">DURBY</div>
          <div className="text-[11px] font-medium text-ink-400 tracking-wide leading-none mt-1">
            Warehouse &amp; Inventory
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-ink-400 hover:bg-white/5 hover:text-ink-100',
              )
            }
          >
            <item.icon size={17} strokeWidth={2} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="mx-3 mb-4 rounded-xl bg-white/5 px-4 py-3.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-brand-300">V1 Prototype</div>
        <p className="mt-1 text-xs leading-relaxed text-ink-400">
          Live demo of the Durby Warehouse concept. Data resets from the Reset Demo control.
        </p>
      </div>
    </aside>
  )
}
