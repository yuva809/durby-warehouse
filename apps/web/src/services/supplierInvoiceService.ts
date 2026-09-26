import { api } from '../lib/apiClient'
import type { SupplierInvoice } from '../types'

export const supplierInvoiceService = {
  list(): Promise<SupplierInvoice[]> {
    return api.get<SupplierInvoice[]>('/supplier-invoices')
  },

  get(id: string): Promise<SupplierInvoice> {
    return api.get<SupplierInvoice>(`/supplier-invoices/${id}`)
  },

  /** `warnings`: lines that were skipped (and why) and any OCR notices. Only present on this response, so the caller passes them on to the review screen. */
  upload(input: { file: File; supplierName: string; invoiceNumber: string; invoiceDate?: string; invoiceTotal?: string }): Promise<SupplierInvoice & { warnings: string[] }> {
    const form = new FormData()
    form.append('file', input.file)
    form.append('supplierName', input.supplierName)
    form.append('invoiceNumber', input.invoiceNumber)
    if (input.invoiceDate) form.append('invoiceDate', input.invoiceDate)
    if (input.invoiceTotal) form.append('invoiceTotal', input.invoiceTotal)
    return api.postForm<SupplierInvoice & { warnings: string[] }>('/supplier-invoices/upload', form)
  },

  updateItem(invoiceId: string, itemId: string, patch: { productId?: string | null; receivedQty?: number }) {
    return api.patch(`/supplier-invoices/${invoiceId}/items/${itemId}`, patch)
  },

  confirm(id: string): Promise<SupplierInvoice> {
    return api.post<SupplierInvoice>(`/supplier-invoices/${id}/confirm`)
  },

  cancel(id: string): Promise<SupplierInvoice> {
    return api.post<SupplierInvoice>(`/supplier-invoices/${id}/cancel`)
  },
}
