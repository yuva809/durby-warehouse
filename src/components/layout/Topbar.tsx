import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { RotateCcw } from 'lucide-react'
import { ViewSwitcher } from './ViewSwitcher'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useWarehouseStore } from '../../store/useWarehouseStore'
import { branchIdForRole } from '../../lib/viewRoles'

const TITLES: { match: (p: string) => boolean; title: string; subtitle: string }[] = [
  { match: (p) => p === '/', title: 'Dashboard', subtitle: 'Real-time view across the network' },
  { match: (p) => p.startsWith('/inventory'), title: 'Inventory', subtitle: 'Stock across warehouse and branches' },
  { match: (p) => p.startsWith('/products'), title: 'Products', subtitle: 'Full catalog managed by Durby' },
  { match: (p) => p.startsWith('/branches'), title: 'Branches', subtitle: 'Five branches supplied from one warehouse' },
  { match: (p) => p.startsWith('/requests'), title: 'Stock Requests', subtitle: 'From submission to approval' },
  { match: (p) => p.startsWith('/transfers'), title: 'Transfers', subtitle: 'Approved requests in motion' },
  { match: (p) => p.startsWith('/deliveries'), title: 'Deliveries', subtitle: 'Picking and last-mile delivery' },
  { match: (p) => p.startsWith('/activity'), title: 'Activity', subtitle: 'Full audit trail of the network' },
  { match: (p) => p.startsWith('/roadmap'), title: 'Roadmap', subtitle: "What's next for Durby Warehouse" },
]

export function Topbar() {
  const location = useLocation()
  const resetDemo = useWarehouseStore((s) => s.resetDemo)
  const view = useWarehouseStore((s) => s.view)
  const locations = useWarehouseStore((s) => s.locations)
  let meta = TITLES.find((t) => t.match(location.pathname)) ?? TITLES[0]

  if (location.pathname === '/') {
    const branchId = branchIdForRole(view)
    if (branchId) {
      meta = { ...meta, title: locations.find((l) => l.id === branchId)?.name ?? meta.title, subtitle: 'My Inventory & Requests' }
    } else if (view === 'delivery_person') {
      meta = { ...meta, title: "Today's Deliveries", subtitle: 'Pick, deliver, and confirm' }
    } else if (view === 'warehouse_manager') {
      meta = { ...meta, subtitle: 'Review requests, approve transfers, keep branches stocked' }
    }
  }

  const [confirmingReset, setConfirmingReset] = useState(false)

  function handleReset() {
    resetDemo()
    setConfirmingReset(false)
  }

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-ink-200/70 bg-white/85 px-6 py-4 backdrop-blur-md">
      <div>
        <h1 className="font-display text-xl font-bold text-ink-900">{meta.title}</h1>
        <p className="text-sm text-ink-500">{meta.subtitle}</p>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setConfirmingReset(true)}
          title="Reset demo data"
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-ink-500 ring-1 ring-inset ring-ink-200 hover:bg-ink-50 hover:text-ink-700 cursor-pointer"
        >
          <RotateCcw size={14} />
          Reset Demo
        </button>
        <ViewSwitcher />
      </div>

      <Modal open={confirmingReset} onClose={() => setConfirmingReset(false)}>
        <div className="p-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink-100 text-ink-500">
            <RotateCcw size={19} />
          </div>
          <h3 className="mt-3 font-display text-lg font-bold text-ink-900">Reset Demo?</h3>
          <p className="mt-1 text-sm text-ink-500">
            This restores every branch, request, and transfer to its starting state. Anything changed during this
            session will be lost.
          </p>
          <div className="mt-5 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmingReset(false)}>
              Cancel
            </Button>
            <Button variant="danger" className="flex-1" onClick={handleReset}>
              Reset Demo
            </Button>
          </div>
        </div>
      </Modal>
    </header>
  )
}
