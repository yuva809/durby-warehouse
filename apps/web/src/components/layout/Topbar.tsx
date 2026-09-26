import { useLocation as useRouteLocation, useNavigate } from 'react-router-dom'
import { KeyRound, LogOut, Menu } from 'lucide-react'
import { useAuthStore } from '../../auth/authStore'
import { isBranchUser, isDriver, isManager, ROLE_LABEL } from '../../auth/roles'
import { useLocations } from '../../hooks/useCatalog'
import { queryClient } from '../../lib/queryClient'

const TITLES: { match: (p: string) => boolean; title: string; subtitle: string }[] = [
  { match: (p) => p === '/', title: 'Dashboard', subtitle: 'Real-time view across the network' },
  { match: (p) => p.startsWith('/inventory'), title: 'Inventory', subtitle: 'Stock across warehouse and branches' },
  { match: (p) => p.startsWith('/products'), title: 'Products', subtitle: 'Full catalog managed by Asia Might Super Market' },
  { match: (p) => p.startsWith('/branches'), title: 'Branches', subtitle: 'Five branches supplied from one warehouse' },
  { match: (p) => p.startsWith('/requests'), title: 'Stock Requests', subtitle: 'From submission to approval' },
  { match: (p) => p.startsWith('/transfers'), title: 'Transfers', subtitle: 'Approved requests in motion' },
  { match: (p) => p.startsWith('/deliveries'), title: 'Deliveries', subtitle: 'Picking and last-mile delivery' },
  { match: (p) => p.startsWith('/activity'), title: 'Activity', subtitle: 'Full audit trail of the network' },
  { match: (p) => p.startsWith('/users'), title: 'Users', subtitle: 'Accounts and password resets' },
  { match: (p) => p.startsWith('/stock-intake'), title: 'Stock Intake', subtitle: 'Supplier invoices, reviewed before stock is added' },
  { match: (p) => p.startsWith('/documents'), title: 'Documents', subtitle: 'Order Confirmations and Delivery Challans' },
]

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const routeLocation = useRouteLocation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const { data: locations } = useLocations()

  let meta = TITLES.find((t) => t.match(routeLocation.pathname)) ?? TITLES[0]

  if (routeLocation.pathname === '/' && user) {
    if (isBranchUser(user)) {
      const branchName = locations?.find((l) => l.id === user.locationId)?.name ?? 'My Branch'
      meta = { ...meta, title: branchName, subtitle: 'Request, track, and receive stock' }
    } else if (isDriver(user)) {
      meta = { ...meta, title: "Today's Deliveries", subtitle: 'Pick, deliver, and confirm' }
    } else if (isManager(user)) {
      meta = { ...meta, subtitle: 'Review requests, approve transfers, keep branches stocked' }
    }
  }

  function handleLogout() {
    logout()
    // Otherwise the next login in this tab (a different user, or a
    // different branch) can briefly render this session's cached lists —
    // query keys like ['requests','all'] aren't scoped per-user, so the
    // cache has to be dropped explicitly at the session boundary.
    queryClient.clear()
    navigate('/login', { replace: true })
  }

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-ink-200/70 bg-white/85 px-4 py-3 backdrop-blur-md sm:gap-4 sm:px-6 sm:py-4">
      <div className="flex min-w-0 items-center gap-2">
        <button
          onClick={onMenuClick}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-600 hover:bg-ink-100 cursor-pointer lg:hidden"
        >
          <Menu size={19} />
        </button>
        <div className="min-w-0">
          <h1 className="truncate font-display text-base font-bold text-ink-900 sm:text-xl">{meta.title}</h1>
          <p className="hidden truncate text-sm text-ink-500 sm:block">{meta.subtitle}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {user && (
          <div className="hidden text-right leading-tight sm:block">
            <div className="text-sm font-semibold text-ink-800">{user.name}</div>
            <div className="text-xs text-ink-400">{ROLE_LABEL[user.role]}</div>
          </div>
        )}
        <button
          onClick={() => navigate('/change-password')}
          title="Change password"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-ink-500 ring-1 ring-inset ring-ink-200 hover:bg-ink-50 hover:text-ink-700 cursor-pointer"
        >
          <KeyRound size={16} />
        </button>
        <button
          onClick={handleLogout}
          title="Log out"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-ink-500 ring-1 ring-inset ring-ink-200 hover:bg-ink-50 hover:text-ink-700 cursor-pointer"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  )
}
