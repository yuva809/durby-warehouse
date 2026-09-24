import { useState } from 'react'
import { Card } from '../components/ui/Card'
import { TransferStatusBadge } from '../components/ui/StatusBadge'
import { EmptyState } from '../components/ui/EmptyState'
import { TransferDrawer } from '../components/transfers/TransferDrawer'
import { useTransfers } from '../hooks/useTransfers'
import { transferDocNumber } from '../lib/utils'
import { ArrowLeftRight } from 'lucide-react'

export default function Transfers() {
  const { data: transfers = [] } = useTransfers()
  const [openTransfer, setOpenTransfer] = useState<string | null>(null)

  const sorted = [...transfers].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        {sorted.length === 0 ? (
          <EmptyState icon={<ArrowLeftRight size={22} />} title="No transfers yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/60 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
                  <th className="px-5 py-3">Delivery</th>
                  <th className="px-3 py-3">From</th>
                  <th className="px-3 py-3">To</th>
                  <th className="px-3 py-3">Items</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-5 py-3">Driver</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => setOpenTransfer(t.id)}
                    className="cursor-pointer border-b border-ink-50 last:border-0 hover:bg-brand-50/40"
                  >
                    <td className="px-5 py-3.5 font-semibold text-ink-900 whitespace-nowrap">{transferDocNumber(t)}</td>
                    <td className="px-3 py-3.5 text-ink-600 whitespace-nowrap">Central Warehouse</td>
                    <td className="px-3 py-3.5 text-ink-600 whitespace-nowrap">{t.branch?.name}</td>
                    <td className="px-3 py-3.5 text-ink-600 whitespace-nowrap">
                      {t.items.length} product{t.items.length === 1 ? '' : 's'}
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap">
                      <TransferStatusBadge status={t.status} />
                    </td>
                    <td className="px-5 py-3.5 text-ink-600 whitespace-nowrap">{t.driver?.name ?? 'Unassigned'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <TransferDrawer transferId={openTransfer} onClose={() => setOpenTransfer(null)} />
    </div>
  )
}
