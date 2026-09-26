import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, FileUp, Upload } from 'lucide-react'
import { Drawer } from '../../components/ui/Drawer'
import { Button } from '../../components/ui/Button'
import { useUploadSupplierInvoice } from '../../hooks/useSupplierInvoices'

export function UploadInvoiceDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const upload = useUploadSupplierInvoice()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [supplierName, setSupplierName] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')

  function reset() {
    setFile(null)
    setSupplierName('')
    setInvoiceNumber('')
    setInvoiceDate('')
    upload.reset()
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleSubmit() {
    if (!file || !supplierName.trim() || !invoiceNumber.trim()) return
    const invoice = await upload.mutateAsync({ file, supplierName: supplierName.trim(), invoiceNumber: invoiceNumber.trim(), invoiceDate: invoiceDate || undefined })
    reset()
    onClose()
    navigate(`/stock-intake/${invoice.id}`, { state: { warnings: invoice.warnings } })
  }

  const canSubmit = !!file && supplierName.trim().length > 0 && invoiceNumber.trim().length > 0

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      title="Upload Supplier Invoice"
      subtitle="PDF, CSV, XLSX or XLSM — this does not change inventory until you review and confirm it."
      footer={
        <div className="space-y-2">
          {upload.isError && (
            <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <AlertTriangle size={14} className="shrink-0" /> {(upload.error as Error).message}
            </div>
          )}
          <Button className="w-full" size="lg" disabled={!canSubmit || upload.isPending} onClick={handleSubmit}>
            {upload.isPending ? 'Uploading…' : 'Upload & Review'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <button
          onClick={() => fileRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-200 bg-ink-50/50 py-8 text-center hover:border-brand-300 hover:bg-brand-50/30 cursor-pointer"
        >
          <FileUp size={22} className="text-ink-400" />
          <div className="text-sm font-medium text-ink-700">{file ? file.name : 'Choose a file'}</div>
          <div className="text-xs text-ink-400">PDF, CSV, XLSX or XLSM</div>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.csv,.xlsx,.xlsm,.xls,application/pdf,text/csv"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />

        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-ink-400">Supplier Name</label>
          <input
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            placeholder="e.g. Fresh Tropical S.r.l."
            className="mt-1.5 w-full rounded-lg bg-ink-50 px-3 py-2.5 text-sm text-ink-800 outline-none ring-1 ring-inset ring-ink-200 placeholder:text-ink-400 focus:ring-brand-400"
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-ink-400">Invoice Number</label>
          <input
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            placeholder="e.g. 10136161"
            className="mt-1.5 w-full rounded-lg bg-ink-50 px-3 py-2.5 text-sm text-ink-800 outline-none ring-1 ring-inset ring-ink-200 placeholder:text-ink-400 focus:ring-brand-400"
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-ink-400">Invoice Date (optional)</label>
          <input
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            className="mt-1.5 w-full rounded-lg bg-ink-50 px-3 py-2.5 text-sm text-ink-800 outline-none ring-1 ring-inset ring-ink-200 focus:ring-brand-400"
          />
        </div>

        <div className="flex items-start gap-2 rounded-lg bg-blue-50 px-3 py-2.5 text-xs text-blue-700">
          <Upload size={14} className="mt-0.5 shrink-0" />
          Uploading only parses the file for review. Nothing is added to stock until you confirm it on the next screen.
        </div>
      </div>
    </Drawer>
  )
}
