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
  X,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { LogoMark } from './LogoMark'
import { useWarehouseStore } from '../../store/useWarehouseStore'
import { branchIdForRole } from '../../lib/viewRoles'

// A branch's job is request -> track -> receive, not inventory management —
// each item opts into branch visibility rather than being cross-referenced
// against a separate list, so a new item defaults to manager/overview-only.
const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, branchVisible: true },
  { to: '/inventory', label: 'Inventory', icon: Boxes },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/branches', label: 'Branches', icon: Store },
  { to: '/requests', label: 'Stock Requests', icon: ClipboardList, branchVisible: true },
  { to: '/transfers', label: 'Transfers', icon: ArrowLeftRight },
  { to: '/deliveries', label: 'Deliveries', icon: Truck },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/roadmap', label: 'Roadmap', icon: Map, branchVisible: true },
]

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const view = useWarehouseStore((s) => s.view)
  const isBranch = !!branchIdForRole(view)
  const navItems = isBranch ? NAV.filter((item) => item.branchVisible) : NAV

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-ink-950/50 backdrop-blur-[2px] animate-fade-in lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-ink-950 text-ink-200 transition-transform duration-200 ease-out',
          'lg:static lg:z-auto lg:w-64 lg:shrink-0 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between gap-2.5 px-6 py-6">
          <div className="flex items-center gap-2.5">
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
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-400 hover:bg-white/10 hover:text-white cursor-pointer lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onClose}
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

        <div className="mx-3 mb-4 shrink-0 rounded-xl bg-white/5 px-4 py-3.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-brand-300">V1 Prototype</div>
          <p className="mt-1 text-xs leading-relaxed text-ink-400">
            Live demo of the Durby Warehouse concept. Data resets from the Reset Demo control.
          </p>
        </div>
      </aside>
    </>
  )
}
