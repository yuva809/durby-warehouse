import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { productImageService } from '../services/productImageService'

export function useProductImage(productId: string | null) {
  return useQuery({
    queryKey: ['product-image', productId],
    queryFn: () => productImageService.get(productId!),
    enabled: !!productId,
  })
}

function invalidate(qc: ReturnType<typeof useQueryClient>, productId: string) {
  qc.invalidateQueries({ queryKey: ['product-image', productId] })
  qc.invalidateQueries({ queryKey: ['products'] })
  qc.invalidateQueries({ queryKey: ['warehouse-availability'] })
  qc.invalidateQueries({ queryKey: ['supplier-invoices'] })
}

export function useLookupProductImage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: productImageService.lookup,
    onSuccess: (_data, productId) => invalidate(qc, productId),
  })
}

export function useSearchAgainProductImage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: productImageService.searchAgain,
    onSuccess: (_data, productId) => invalidate(qc, productId),
  })
}

export function useApproveProductImage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: productImageService.approve,
    onSuccess: (_data, productId) => invalidate(qc, productId),
  })
}

export function useUploadProductImage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ productId, file }: { productId: string; file: File }) => productImageService.upload(productId, file),
    onSuccess: (_data, vars) => invalidate(qc, vars.productId),
  })
}

export function useRemoveProductImage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: productImageService.remove,
    onSuccess: (_data, productId) => invalidate(qc, productId),
  })
}
