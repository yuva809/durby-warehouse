import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthUser } from '../types'

interface AuthState {
  token: string | null
  user: AuthUser | null
  setSession: (token: string, user: AuthUser) => void
  logout: () => void
}

/**
 * The only Zustand store left in the app — deliberately. Everything that
 * used to be business data (products, inventory, requests, transfers,
 * activity) now lives on the server and is read via TanStack Query
 * (see src/hooks/*); this store holds only the current session, which is
 * genuinely client/UI state.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: 'durby-warehouse-session' },
  ),
)
