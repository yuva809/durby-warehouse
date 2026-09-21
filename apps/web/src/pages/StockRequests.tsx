import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
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
  const [tab, setTab] = useState<RequestStatus | 'all'>('all')
  const [openRequest, setOpenRequest] = useState<string | null>(null)
  const [openTransfer, setOpenTransfer] = useState<string | null>(null)
  const [newRequestOpen, setNewRequestOpen] = useState(false)

  const filtered = useMemo(() => {
    // No client-side branchId filter needed: the API already scopes
    // /requests to the caller's own branch for a BRANCH_USER.
    let list = requests
    if (tab !== 'all') list = list.filter((r) => r.status === tab)
    return [...list].sort((a, b) => {
      const priority = (s: RequestStatus) => (s === 'PENDING' ? 0 : s === 'REVIEWING' ? 1 : 2)
      const pd = priority(a.status) - priority(b.status)
      if (pd !== 0 && !isBranch) return pd
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  }, [requests, tab, isBranch])

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
                    <div className="text-sm font-semibold text-ink-900">{r.code}</div>
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
