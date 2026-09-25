import { api } from '../lib/apiClient'
import type { ManagedUser, PasswordResetIssued } from '../types'

export const userService = {
  list() {
    return api.get<ManagedUser[]>('/users')
  },
  /** The server decides who may reset whom; the UI only mirrors the rule to avoid offering impossible actions. */
  issueResetCode(userId: string) {
    return api.post<PasswordResetIssued>(`/users/${userId}/reset-password`)
  },
}
