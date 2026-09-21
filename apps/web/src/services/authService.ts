import { api } from '../lib/apiClient'
import type { AuthUser } from '../types'

interface LoginResponse {
  accessToken: string
  user: { id: string; email: string; name: string; role: AuthUser['role']; locationId: string | null }
}

export const authService = {
  async login(email: string, password: string) {
    const res = await api.post<LoginResponse>('/auth/login', { email, password })
    const user: AuthUser = {
      userId: res.user.id,
      email: res.user.email,
      name: res.user.name,
      role: res.user.role,
      locationId: res.user.locationId,
    }
    return { token: res.accessToken, user }
  },
}
