import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supplierInvoiceService } from '../services/supplierInvoiceService'

export function useSupplierInvoices() {
  return useQuery({ queryKey: ['supplier-invoices'], queryFn: supplierInvoiceService.list })
}

export function useSupplierInvoice(id: string | null) {
  return useQuery({
    queryKey: ['supplier-invoices', id],
    queryFn: () => supplierInvoiceService.get(id!),
    enabled: !!id,
  })
}

export function useUploadSupplierInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: supplierInvoiceService.upload,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplier-invoices'] }),
  })
}

export function useUpdateSupplierInvoiceItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ invoiceId, itemId, patch }: { invoiceId: string; itemId: string; patch: { productId?: string | null; receivedQty?: number } }) =>
      supplierInvoiceService.updateItem(invoiceId, itemId, patch),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['supplier-invoices', vars.invoiceId] }),
  })
}

export function useConfirmSupplierInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: supplierInvoiceService.confirm,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-invoices'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['warehouse-availability'] })
      qc.invalidateQueries({ queryKey: ['movements'] })
      qc.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

export function useCancelSupplierInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: supplierInvoiceService.cancel,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplier-invoices'] }),
  })
}
