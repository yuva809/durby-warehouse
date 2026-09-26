import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { userService } from '../services/userService'

export function useUsers() {
  return useQuery({ queryKey: ['users'], queryFn: userService.list })
}

/**
 * Every mutation refreshes the list. The one-time codes returned by invite/resend/reset are deliberately
 * NOT cached: they must live only in the component that shows them once.
 */
export function useUserActions() {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: ['users'] })
  return {
    invite: useMutation({ mutationFn: userService.invite, onSuccess: refresh }),
    resendInvitation: useMutation({ mutationFn: (id: string) => userService.resendInvitation(id), onSuccess: refresh }),
    revokeInvitation: useMutation({ mutationFn: (id: string) => userService.revokeInvitation(id), onSuccess: refresh }),
    update: useMutation({ mutationFn: (v: { id: string; name?: string; locationId?: string }) => userService.update(v.id, { name: v.name, locationId: v.locationId }), onSuccess: refresh }),
    deactivate: useMutation({ mutationFn: (id: string) => userService.deactivate(id), onSuccess: refresh }),
    reactivate: useMutation({ mutationFn: (id: string) => userService.reactivate(id), onSuccess: refresh }),
    revokeSessions: useMutation({ mutationFn: (id: string) => userService.revokeSessions(id), onSuccess: refresh }),
    issueResetCode: useMutation({ mutationFn: (id: string) => userService.issueResetCode(id), onSuccess: refresh }),
  }
}
