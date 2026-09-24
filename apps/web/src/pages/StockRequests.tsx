import { useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { RequestStatusBadge } from '../components/ui/StatusBadge'
import { EmptyState } from '../components/ui/EmptyState'
import { RequestDrawer } from '../components/requests/RequestDrawer'
import { RequestStockDrawer } from '../components/requests/RequestStockDrawer'
import { TransferDrawer } from '../components/transfers/TransferDrawer'
import { useAuthStore } from '../auth/authStore'
import { isBranchUser } from '../auth/roles'
import { useRequests } from '../hooks/useRequests'
import { useLocations } from '../hooks/useCatalog'
import { cn, formatDateTime } from '../lib/utils'
import type { RequestStatus } from '../types'
import { ClipboardList } from 'lucide-react'

const TABS: { key: RequestStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'REVIEWING', label: 'Reviewing' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'PARTIALLY_DELIVERED', label: 'Partial' },
  { key: 'DELIVERED', label: 'Delivered' },
]

export default function StockRequests() {
  const user = useAuthStore((s) => s.user)
  const isBranch = isBranchUser(user)
  const { data: requests = [] } = useRequests()
  const { data: locations = [] } = useLocations()
  const branches = useMemo(() => locations.filter((l) => l.type === 'BRANCH'), [locations])
  const [tab, setTab] = useState<RequestStatus | 'all'>('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [openRequest, setOpenRequest] = useState<string | null>(null)
  const [openTransfer, setOpenTransfer] = useState<string | null>(null)
  const [newRequestOpen, setNewRequestOpen] = useState(false)

  const filtered = useMemo(() => {
    // No client-side branchId filter needed for BRANCH_USER: the API
    // already scopes /requests to the caller's own branch. The branch
    // dropdown below is manager-only, for narrowing the full cross-branch
    // list down to one branch at a time.
    let list = requests
    if (tab !== 'all') list = list.filter((r) => r.status === tab)
    if (!isBranch && branchFilter !== 'all') list = list.filter((r) => r.branchId === branchFilter)
    if (!isBranch && query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter((r) => r.code.toLowerCase().includes(q) || r.ocNumber.toLowerCase().includes(q))
    }
    return [...list].sort((a, b) => {
      const priority = (s: RequestStatus) => (s === 'PENDING' ? 0 : s === 'REVIEWING' ? 1 : 2)
      const pd = priority(a.status) - priority(b.status)
      if (pd !== 0 && !isBranch) return pd
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  }, [requests, tab, branchFilter, query, isBranch])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'rounded-lg px-3.5 py-2 text-sm font-medium transition-colors cursor-pointer',
                tab === t.key ? 'bg-ink-900 text-white' : 'bg-white text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-50',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {isBranch && (
          <Button size="lg" onClick={() => setNewRequestOpen(true)}>
            <Plus size={16} /> Request Stock
          </Button>
        )}
      </div>

      {!isBranch && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="rounded-lg bg-white px-3 py-2 text-sm text-ink-700 outline-none ring-1 ring-inset ring-ink-200 focus:ring-brand-400"
          >
            <option value="all">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Order number…"
              className="w-40 rounded-lg bg-white py-2 pl-8 pr-3 text-sm text-ink-700 outline-none ring-1 ring-inset ring-ink-200 placeholder:text-ink-400 focus:ring-brand-400"
            />
          </div>
        </div>
      )}

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState icon={<ClipboardList size={22} />} title="No requests here" subtitle="Requests will show up here as branches submit them." />
        ) : (
          <div className="divide-y divide-ink-50">
            {filtered.map((r) => (
              <button
                key={r.id}
                onClick={() => setOpenRequest(r.id)}
                className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-brand-50/40 cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
                    <ClipboardList size={16} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-ink-900">{r.ocNumber}</div>
                    <div className="text-xs text-ink-400">
                      {!isBranch && `${r.branch?.name} · `}
                      {r.items.length} product{r.items.length === 1 ? '' : 's'} · {formatDateTime(r.createdAt)}
                    </div>
                  </div>
                </div>
                <RequestStatusBadge status={r.status} />
              </button>
            ))}
          </div>
        )}
      </Card>

      <RequestDrawer requestId={openRequest} onClose={() => setOpenRequest(null)} onViewTransfer={setOpenTransfer} />
      <TransferDrawer transferId={openTransfer} onClose={() => setOpenTransfer(null)} />
      {isBranch && <RequestStockDrawer open={newRequestOpen} onClose={() => setNewRequestOpen(false)} />}
    </div>
  )
}
