import { api } from '../lib/apiClient'
import type { InvitationIssued, ManagedUser, PasswordResetIssued, Role } from '../types'

export const userService = {
  list() {
    return api.get<ManagedUser[]>('/users')
  },
  /** The server decides who may invite whom, into which role and branch; the UI only mirrors it. */
  invite(body: { email: string; name: string; role: Role; locationId?: string }) {
    return api.post<InvitationIssued>('/users/invitations', body)
  },
  resendInvitation(userId: string) {
    return api.post<InvitationIssued>(`/users/${userId}/invitation/resend`)
  },
  revokeInvitation(userId: string) {
    return api.post<ManagedUser>(`/users/${userId}/invitation/revoke`)
  },
  update(userId: string, body: { name?: string; locationId?: string }) {
    return api.patch<ManagedUser>(`/users/${userId}`, body)
  },
  deactivate(userId: string) {
    return api.post<ManagedUser>(`/users/${userId}/deactivate`)
  },
  reactivate(userId: string) {
    return api.post<ManagedUser>(`/users/${userId}/reactivate`)
  },
  revokeSessions(userId: string) {
    return api.post<ManagedUser>(`/users/${userId}/revoke-sessions`)
  },
  /** The server decides who may reset whom; the UI only mirrors the rule to avoid offering impossible actions. */
  issueResetCode(userId: string) {
    return api.post<PasswordResetIssued>(`/users/${userId}/reset-password`)
  },
}
