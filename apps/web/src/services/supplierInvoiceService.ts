import { api } from '../lib/apiClient'
import type { SupplierInvoice } from '../types'

export const supplierInvoiceService = {
  list(): Promise<SupplierInvoice[]> {
    return api.get<SupplierInvoice[]>('/supplier-invoices')
  },

  get(id: string): Promise<SupplierInvoice> {
    return api.get<SupplierInvoice>(`/supplier-invoices/${id}`)
  },

  upload(input: { file: File; supplierName: string; invoiceNumber: string; invoiceDate?: string }): Promise<SupplierInvoice> {
    const form = new FormData()
    form.append('file', input.file)
    form.append('supplierName', input.supplierName)
    form.append('invoiceNumber', input.invoiceNumber)
    if (input.invoiceDate) form.append('invoiceDate', input.invoiceDate)
    return api.postForm<SupplierInvoice>('/supplier-invoices/upload', form)
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
