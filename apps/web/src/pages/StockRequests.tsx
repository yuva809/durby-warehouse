import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { RequestStatusBadge } from '../components/ui/StatusBadge'
import { EmptyState } from '../components/ui/EmptyState'
import { RequestDrawer } from '../components/requests/RequestDrawer'
import { RequestStockDrawer } from '../components/requests/RequestStockDrawer'
import { TransferDrawer } from '../components/transfers/TransferDrawer'
import { useWarehouseStore } from '../store/useWarehouseStore'
import { branchIdForRole } from '../lib/viewRoles'
import { cn, formatDateTime } from '../lib/utils'
import type { RequestStatus } from '../types'
import { ClipboardList } from 'lucide-react'

const TABS: { key: RequestStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'reviewing', label: 'Reviewing' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'delivered', label: 'Delivered' },
]

export default function StockRequests() {
  const view = useWarehouseStore((s) => s.view)
  const requests = useWarehouseStore((s) => s.requests)
  const locations = useWarehouseStore((s) => s.locations)
  const [tab, setTab] = useState<RequestStatus | 'all'>('all')
  const [openRequest, setOpenRequest] = useState<string | null>(null)
  const [openTransfer, setOpenTransfer] = useState<string | null>(null)
  const [newRequestOpen, setNewRequestOpen] = useState(false)

  const branchId = branchIdForRole(view)
  const isBranch = !!branchId

  const filtered = useMemo(() => {
    let list = requests
    if (branchId) list = list.filter((r) => r.branchId === branchId)
    if (tab !== 'all') list = list.filter((r) => r.status === tab)
    return [...list].sort((a, b) => {
      const priority = (s: RequestStatus) => (s === 'pending' ? 0 : s === 'reviewing' ? 1 : 2)
      const pd = priority(a.status) - priority(b.status)
      if (pd !== 0 && !isBranch) return pd
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  }, [requests, branchId, tab, isBranch])

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
            {filtered.map((r) => {
              const branch = locations.find((l) => l.id === r.branchId)
              return (
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
                      <div className="text-sm font-semibold text-ink-900">{r.id}</div>
                      <div className="text-xs text-ink-400">
                        {!isBranch && `${branch?.name} · `}
                        {r.items.length} product{r.items.length === 1 ? '' : 's'} · {formatDateTime(r.createdAt)}
                      </div>
                    </div>
                  </div>
                  <RequestStatusBadge status={r.status} />
                </button>
              )
            })}
          </div>
        )}
      </Card>

      <RequestDrawer requestId={openRequest} onClose={() => setOpenRequest(null)} onViewTransfer={setOpenTransfer} />
      <TransferDrawer transferId={openTransfer} onClose={() => setOpenTransfer(null)} />
      {branchId && <RequestStockDrawer branchId={branchId} open={newRequestOpen} onClose={() => setNewRequestOpen(false)} />}
    </div>
  )
}
