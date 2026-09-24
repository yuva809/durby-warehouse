import { useMemo, useState } from 'react'
import { FileDown, FileText, Search } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { Button } from '../components/ui/Button'
import { useRequests } from '../hooks/useRequests'
import { useTransfers } from '../hooks/useTransfers'
import { useLocations } from '../hooks/useCatalog'
import { documentService } from '../services/documentService'
import { cn, formatDateTime } from '../lib/utils'

const TABS = ['Order Confirmations', 'Delivery Challans'] as const

export default function Documents() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Order Confirmations')
  const [branchFilter, setBranchFilter] = useState('all')
  const [query, setQuery] = useState('')
  const { data: requests = [] } = useRequests()
  const { data: transfers = [] } = useTransfers()
  const { data: locations = [] } = useLocations()
  const branches = useMemo(() => locations.filter((l) => l.type === 'BRANCH'), [locations])

  const filteredRequests = useMemo(() => {
    let list = requests
    if (branchFilter !== 'all') list = list.filter((r) => r.branchId === branchFilter)
    if (query.trim()) list = list.filter((r) => r.ocNumber.toLowerCase().includes(query.trim().toLowerCase()))
    return [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [requests, branchFilter, query])

  const dispatchedTransfers = useMemo(() => {
    let list = transfers.filter((t) => !!t.dcNumber)
    if (branchFilter !== 'all') list = list.filter((t) => t.branchId === branchFilter)
    if (query.trim()) list = list.filter((t) => t.dcNumber!.toLowerCase().includes(query.trim().toLowerCase()))
    return [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [transfers, branchFilter, query])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold text-ink-900">Documents</h1>
        <p className="text-sm text-ink-500 mt-0.5">Every Order Confirmation and Delivery Challan, in one place.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'rounded-lg px-3.5 py-2 text-sm font-medium transition-colors cursor-pointer',
                tab === t ? 'bg-ink-900 text-white' : 'bg-white text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-50',
              )}
            >
              {t}
            </button>
          ))}
        </div>
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
              placeholder="Document number…"
              className="w-44 rounded-lg bg-white py-2 pl-8 pr-3 text-sm text-ink-700 outline-none ring-1 ring-inset ring-ink-200 placeholder:text-ink-400 focus:ring-brand-400"
            />
          </div>
        </div>
      </div>

      <Card className="overflow-hidden">
        {tab === 'Order Confirmations' ? (
          filteredRequests.length === 0 ? (
            <EmptyState icon={<FileText size={22} />} title="No order confirmations" />
          ) : (
            <div className="divide-y divide-ink-50">
              {filteredRequests.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-5 py-4">
                  <div>
                    <div className="text-sm font-semibold text-ink-900">{r.ocNumber}</div>
                    <div className="text-xs text-ink-400">{r.branch?.name} · {formatDateTime(r.createdAt)}</div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => documentService.downloadOrderConfirmation(r.id, r.ocNumber)}>
                    <FileDown size={14} /> Download
                  </Button>
                </div>
              ))}
            </div>
          )
        ) : dispatchedTransfers.length === 0 ? (
          <EmptyState icon={<FileText size={22} />} title="No delivery challans yet" subtitle="A challan is created the moment a transfer is dispatched." />
        ) : (
          <div className="divide-y divide-ink-50">
            {dispatchedTransfers.map((t) => (
              <div key={t.id} className="flex items-center justify-between px-5 py-4">
                <div>
                  <div className="text-sm font-semibold text-ink-900">{t.dcNumber}</div>
                  <div className="text-xs text-ink-400">
                    {t.branch?.name} · Order {t.request?.ocNumber ?? '—'} · {formatDateTime(t.createdAt)}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => documentService.downloadDeliveryChallan(t.id, t.dcNumber!)}>
                  <FileDown size={14} /> Download
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
