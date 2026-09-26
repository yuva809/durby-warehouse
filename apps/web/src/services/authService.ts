import { api } from '../lib/apiClient'
import type { AuthUser } from '../types'

interface SessionResponse {
  accessToken: string
  mustChangePassword: boolean
  user: { id: string; email: string; name: string; role: AuthUser['role']; locationId: string | null }
}

function toSession(res: SessionResponse) {
  const user: AuthUser = {
    userId: res.user.id,
    email: res.user.email,
    name: res.user.name,
    role: res.user.role,
    locationId: res.user.locationId,
    mustChangePassword: res.mustChangePassword,
  }
  return { token: res.accessToken, user }
}

export const authService = {
  async login(email: string, password: string) {
    return toSession(await api.post<SessionResponse>('/auth/login', { email, password }))
  },

  /** Ends every OTHER session for this account and returns a fresh one for this device. */
  async changePassword(currentPassword: string, newPassword: string) {
    return toSession(await api.post<SessionResponse>('/auth/change-password', { currentPassword, newPassword }))
  },

  /** Public: the invitee follows a one-time link and chooses their own password. */
  acceptInvitation(code: string, newPassword: string) {
    return api.post<{ ok: true }>('/auth/accept-invitation', { code, newPassword })
  },

  /** Public: the user is locked out. The code came from an administrator. */
  resetPassword(code: string, newPassword: string) {
    return api.post<{ ok: true }>('/auth/reset-password', { code, newPassword })
  },
}
