import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, FileUp } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { useSupplierInvoices } from '../../hooks/useSupplierInvoices'
import { UploadInvoiceDrawer } from './UploadInvoiceDrawer'
import { formatDateTime } from '../../lib/utils'
import type { SupplierInvoiceStatus } from '../../types'

const STATUS_STYLE: Record<SupplierInvoiceStatus, string> = {
  DRAFT: 'bg-ink-100 text-ink-600 ring-ink-500/10',
  UNDER_REVIEW: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  CONFIRMED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  CANCELLED: 'bg-rose-50 text-rose-600 ring-rose-600/20',
}

export default function StockIntake() {
  const navigate = useNavigate()
  const { data: invoices = [], isLoading } = useSupplierInvoices()
  const [uploadOpen, setUploadOpen] = useState(false)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-ink-900">Stock Intake</h1>
          <p className="text-sm text-ink-500 mt-0.5">Upload supplier invoices, review the quantities, then confirm to add stock.</p>
        </div>
        <Button size="lg" onClick={() => setUploadOpen(true)}>
          <Plus size={16} /> Upload Invoice
        </Button>
      </div>

      {isLoading && <EmptyState title="Loading…" />}
      {!isLoading && invoices.length === 0 && (
        <EmptyState icon={<FileUp size={20} />} title="No supplier invoices yet" subtitle="Upload a PDF, CSV, or Excel invoice to get started." />
      )}

      <div className="space-y-2">
        {invoices.map((inv) => (
          <Card key={inv.id} className="flex cursor-pointer items-center justify-between p-4 hover:ring-brand-300" onClick={() => navigate(`/stock-intake/${inv.id}`)}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-display text-sm font-semibold text-ink-900">{inv.code}</span>
                <Badge className={STATUS_STYLE[inv.status]}>{inv.status.replace('_', ' ')}</Badge>
              </div>
              <div className="mt-0.5 text-xs text-ink-400">
                {inv.supplierName} · Invoice #{inv.invoiceNumber} · {inv._count?.items ?? 0} line{inv._count?.items === 1 ? '' : 's'}
              </div>
            </div>
            <div className="shrink-0 text-right text-xs text-ink-400">
              <div>{formatDateTime(inv.createdAt)}</div>
              <div>{inv.uploadedBy?.name}</div>
            </div>
          </Card>
        ))}
      </div>

      <UploadInvoiceDrawer open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </div>
  )
}
