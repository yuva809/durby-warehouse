import { useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, XCircle } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { useSupplierInvoice, useUpdateSupplierInvoiceItem, useConfirmSupplierInvoice, useCancelSupplierInvoice } from '../../hooks/useSupplierInvoices'
import { useProducts } from '../../hooks/useCatalog'
import { formatDateTime } from '../../lib/utils'
import { api } from '../../lib/apiClient'
import type { SupplierInvoiceStatus } from '../../types'

const STATUS_STYLE: Record<SupplierInvoiceStatus, string> = {
  DRAFT: 'bg-ink-100 text-ink-600 ring-ink-500/10',
  UNDER_REVIEW: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  CONFIRMED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  CANCELLED: 'bg-rose-50 text-rose-600 ring-rose-600/20',
}

export default function StockIntakeDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  // Set by the upload screen: skipped lines and OCR notices from parsing this file (not stored, so only shown right after upload).
  const uploadWarnings = ((useLocation().state as { warnings?: string[] } | null)?.warnings ?? []).filter(Boolean)
  const { data: invoice, isLoading } = useSupplierInvoice(id ?? null)
  const { data: products = [] } = useProducts()
  const updateItem = useUpdateSupplierInvoiceItem()
  const confirm = useConfirmSupplierInvoice()
  const cancel = useCancelSupplierInvoice()
  const [error, setError] = useState<string | null>(null)

  const editable = invoice?.status === 'DRAFT' || invoice?.status === 'UNDER_REVIEW'

  const canConfirm = useMemo(() => {
    if (!invoice?.items?.length) return false
    // needsReview is a real server-side gate (see SupplierInvoicesService.confirm) —
    // mirrored here so the button visibly disables instead of round-tripping a 409.
    return invoice.items.every((it) => it.productId && !it.needsReview && it.receivedQty !== null && it.receivedQty !== undefined && it.receivedQty >= 0)
  }, [invoice])

  if (isLoading) return <EmptyState title="Loading…" />
  if (!invoice) return <EmptyState title="Invoice not found" />

  async function handleConfirm() {
    setError(null)
    try {
      await confirm.mutateAsync(invoice!.id)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  /** Every edit goes through here so a rejected value (e.g. an impossible quantity) is SHOWN, never swallowed. */
  function saveItem(itemId: string, patch: { productId?: string | null; receivedQty?: number }) {
    setError(null)
    updateItem.mutate({ invoiceId: invoice!.id, itemId, patch }, { onError: (e) => setError((e as Error).message) })
  }

  async function handleCancel() {
    if (!window.confirm('Cancel this invoice? It will not be possible to confirm it afterwards.')) return
    setError(null)
    try {
      await cancel.mutateAsync(invoice!.id)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/stock-intake')} className="flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800 cursor-pointer">
        <ArrowLeft size={15} /> Back to Stock Intake
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-xl font-bold text-ink-900">{invoice.code}</h1>
            <Badge className={STATUS_STYLE[invoice.status]}>{invoice.status.replace('_', ' ')}</Badge>
          </div>
          <p className="text-sm text-ink-500 mt-0.5">
            {invoice.supplierName} · Invoice #{invoice.invoiceNumber}
            {invoice.invoiceDate && ` · ${formatDateTime(invoice.invoiceDate)}`}
          </p>
        </div>
        <div className="flex gap-2">
          {invoice.sourceFileName && (
            <Button
              variant="outline"
              onClick={async () => {
                const blob = await api.getBlob(`/supplier-invoices/${invoice.id}/file`)
                const url = URL.createObjectURL(blob)
                window.open(url, '_blank')
              }}
            >
              <Download size={15} /> Source File
            </Button>
          )}
          {editable && (
            <Button variant="outline" onClick={handleCancel}>
              <XCircle size={15} /> Cancel
            </Button>
          )}
        </div>
      </div>

      {uploadWarnings.length > 0 && editable && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800" data-testid="upload-warnings">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle size={16} className="shrink-0" /> Please check this against the original invoice
          </div>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-6 text-xs">
            {uploadWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {invoice.status === 'CONFIRMED' && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={16} className="shrink-0" />
          Stock receipt confirmed by {invoice.confirmedBy?.name ?? '—'} on {invoice.confirmedAt && formatDateTime(invoice.confirmedAt)}. Warehouse onHand has been increased accordingly.
        </div>
      )}
      {invoice.status === 'CANCELLED' && (
        <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <XCircle size={16} className="shrink-0" /> This invoice was cancelled. No stock was ever added from it.
        </div>
      )}

      <Card>
        <CardHeader
          title="Line Items"
          subtitle="Received Qty is editable — only this quantity is added to stock, never the invoice quantity automatically."
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-ink-100 text-left text-xs font-semibold uppercase tracking-wide text-ink-400">
                <th className="px-5 py-2.5">Description</th>
                <th className="px-3 py-2.5">Match</th>
                <th className="px-3 py-2.5 text-right">Invoice Qty</th>
                <th className="px-3 py-2.5 text-right">Received Qty</th>
                <th className="px-5 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items?.map((item) => (
                <tr key={item.id} className="border-t border-ink-100">
                  <td className="px-5 py-3">
                    <div className="font-medium text-ink-800">{item.rawDescription}</div>
                    {item.rawProductCode && <div className="text-xs text-ink-400">Code: {item.rawProductCode}</div>}
                  </td>
                  <td className="px-3 py-3">
                    {editable ? (
                      <select
                        value={item.productId ?? ''}
                        onChange={(e) => saveItem(item.id, { productId: e.target.value || null })}
                        className="rounded-lg bg-ink-50 px-2 py-1.5 text-xs outline-none ring-1 ring-inset ring-ink-200 focus:ring-brand-400"
                      >
                        <option value="">— Select Product —</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-ink-600">{item.product?.name ?? '—'}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-ink-600">{item.invoiceQty}</td>
                  <td className="px-3 py-3 text-right">
                    {editable ? (
                      <input
                        type="number"
                        min={0}
                        value={item.receivedQty ?? ''}
                        onChange={(e) => saveItem(item.id, { receivedQty: Math.max(0, Number(e.target.value)) })}
                        className="w-20 rounded-lg bg-ink-50 px-2 py-1.5 text-right text-sm font-semibold tabular-nums outline-none ring-1 ring-inset ring-ink-200 focus:ring-brand-400"
                      />
                    ) : (
                      <span className="tabular-nums font-semibold text-ink-800">{item.receivedQty ?? '—'}</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {!item.productId ? (
                      <Badge className="bg-rose-50 text-rose-600 ring-rose-600/20">⚠ Needs Review</Badge>
                    ) : item.needsReview ? (
                      <div className="flex flex-col items-start gap-1.5">
                        <Badge className="bg-amber-50 text-amber-700 ring-amber-600/20">
                          {item.matchConfidence === 'fuzzy' ? 'Fuzzy match — verify' : 'Check against invoice'}
                        </Badge>
                        {editable && (
                          // Approves the CURRENT match as it is. (Re-picking the same product in the dropdown fires no change, so a correct match could not be approved before.)
                          <button
                            onClick={() => saveItem(item.id, { productId: item.productId })}
                            className="text-xs font-medium text-brand-600 hover:text-brand-700 cursor-pointer"
                          >
                            Looks right
                          </button>
                        )}
                      </div>
                    ) : (
                      <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-600/20">Matched</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {editable && (
        <div className="space-y-2">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <AlertTriangle size={14} className="shrink-0" /> {error}
            </div>
          )}
          {!canConfirm && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <AlertTriangle size={14} className="shrink-0" /> Every line needs a confirmed product match (pick a product for any "Needs Review" row, and press "Looks right" on rows you have checked) and a received quantity before you can confirm.
            </div>
          )}
          <Button size="lg" disabled={!canConfirm || confirm.isPending} onClick={handleConfirm}>
            <CheckCircle2 size={16} /> {confirm.isPending ? 'Confirming…' : 'Confirm Stock Receipt'}
          </Button>
        </div>
      )}
    </div>
  )
}
