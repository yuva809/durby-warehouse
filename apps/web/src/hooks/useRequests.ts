import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { requestService } from '../services/requestService'
import type { RequestStatus } from '../types'

export function useRequests(status?: RequestStatus) {
  return useQuery({ queryKey: ['requests', status ?? 'all'], queryFn: () => requestService.list(status) })
}

export function useRequest(id: string | null) {
  return useQuery({
    queryKey: ['requests', 'detail', id],
    queryFn: () => requestService.get(id!),
    enabled: !!id,
  })
}

function invalidateAfterRequestChange(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['requests'] })
  qc.invalidateQueries({ queryKey: ['activity'] })
}

export function useSubmitRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: requestService.submit,
    onSuccess: () => invalidateAfterRequestChange(qc),
  })
}

export function useMarkReviewing() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: requestService.markReviewing,
    onSuccess: () => invalidateAfterRequestChange(qc),
  })
}

export function useUpdateApprovedQty() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, productId, approvedQty }: { id: string; productId: string; approvedQty: number }) =>
      requestService.updateApprovedQty(id, productId, approvedQty),
    onSuccess: () => invalidateAfterRequestChange(qc),
  })
}

export function useApproveRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: requestService.approve,
    onSuccess: () => {
      invalidateAfterRequestChange(qc)
      // Approval reserves stock and creates a transfer — both need a refetch,
      // and the branch-visible available-from-warehouse number just changed too.
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['transfers'] })
      qc.invalidateQueries({ queryKey: ['warehouse-availability'] })
    },
  })
}

export function useRejectRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => requestService.reject(id, reason),
    onSuccess: () => invalidateAfterRequestChange(qc),
  })
}

export function useCancelRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: requestService.cancel,
    onSuccess: () => invalidateAfterRequestChange(qc),
  })
}
