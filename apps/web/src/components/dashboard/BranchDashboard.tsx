import { useState } from 'react'
import { Plus, ClipboardList } from 'lucide-react'
import { Card, CardHeader } from '../ui/Card'
import { Button } from '../ui/Button'
import { RequestStatusBadge } from '../ui/StatusBadge'
import { Timeline } from '../ui/Timeline'
import { EmptyState } from '../ui/EmptyState'
import { RequestDrawer } from '../requests/RequestDrawer'
import { RequestStockDrawer } from '../requests/RequestStockDrawer'
import { TransferDrawer } from '../transfers/TransferDrawer'
import { useLocations } from '../../hooks/useCatalog'
import { useRequests } from '../../hooks/useRequests'
import { formatDateTime } from '../../lib/utils'
import { computeRequestTimeline, getCurrentStep } from '../../lib/requestTimeline'
import type { StockRequest } from '../../types'

export function BranchDashboard({ branchId }: { branchId: string }) {
  const { data: locations } = useLocations()
  // The API already scopes /requests to the caller's own branch for a
  // BRANCH_USER — no client-side branchId filter needed (or trusted).
  const { data: requests, isLoading } = useRequests()

  const [requestOpen, setRequestOpen] = useState(false)
  const [openRequest, setOpenRequest] = useState<string | null>(null)
  const [openTransfer, setOpenTransfer] = useState<string | null>(null)

  const branch = locations?.find((l) => l.id === branchId)

  const branchRequests = [...(requests ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )

  // Spotlight whichever in-flight request is furthest along, not just the
  // newest one — a branch can have an older approved/preparing request and a
  // freshly submitted one at the same time, and the former is more actionable.
  const activeRequest = branchRequests
    .filter((r) => r.status !== 'REJECTED' && r.status !== 'CANCELLED' && r.status !== 'DELIVERED' && r.status !== 'PARTIALLY_DELIVERED')
    .reduce<StockRequest | undefined>((best, r) => {
      if (!best) return r
      const rProgress = getCurrentStep(r, r.transfer)
      const bestProgress = getCurrentStep(best, best.transfer)
      return rProgress > bestProgress ? r : best
    }, undefined)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-br from-ink-950 to-ink-800 px-6 py-5 text-white">
        <div>
          <div className="text-xs font-medium text-ink-300">{branch?.name}</div>
          <h2 className="font-display text-2xl font-bold">Request Products</h2>
        </div>
        <Button variant="light" size="lg" onClick={() => setRequestOpen(true)}>
          <Plus size={17} /> Request Stock
        </Button>
      </div>

      {activeRequest && (
        <button onClick={() => setOpenRequest(activeRequest.id)} className="block w-full text-left">
          <Card className="p-5 transition-all hover:-translate-y-0.5 hover:shadow-md cursor-pointer">
            <CardHeader
              className="p-0 pb-4"
              title="Active Request"
              subtitle={`${activeRequest.code} · ${activeRequest.items.length} product${activeRequest.items.length === 1 ? '' : 's'}`}
              action={<RequestStatusBadge status={activeRequest.status} />}
            />
            <Timeline steps={computeRequestTimeline(activeRequest, activeRequest.transfer)} />
          </Card>
        </button>
      )}

      <Card>
        <CardHeader title="Recent Requests" subtitle="Everything you've ordered from the warehouse" />
        {!isLoading && branchRequests.length === 0 ? (
          <EmptyState
            icon={<ClipboardList size={20} />}
            title="No requests yet"
            subtitle="Tap Request Stock to send your first order to the warehouse."
          />
        ) : (
          <div className="divide-y divide-ink-50 border-t border-ink-100">
            {branchRequests.slice(0, 8).map((r) => (
              <button
                key={r.id}
                onClick={() => setOpenRequest(r.id)}
                className="flex w-full items-center justify-between px-5 py-3.5 text-left hover:bg-brand-50/40 cursor-pointer"
              >
                <div>
                  <div className="text-sm font-semibold text-ink-900">{r.code}</div>
                  <div className="text-xs text-ink-400">{r.items.length} products · {formatDateTime(r.createdAt)}</div>
                </div>
                <RequestStatusBadge status={r.status} />
              </button>
            ))}
          </div>
        )}
      </Card>

      <RequestDrawer requestId={openRequest} onClose={() => setOpenRequest(null)} onViewTransfer={setOpenTransfer} />
      <TransferDrawer transferId={openTransfer} onClose={() => setOpenTransfer(null)} />
      <RequestStockDrawer open={requestOpen} onClose={() => setRequestOpen(false)} />
    </div>
  )
}
