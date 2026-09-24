import { QueryClient } from '@tanstack/react-query'

/**
 * The single QueryClient instance for the app. Exported (not just created
 * inline in main.tsx) so non-component code — the API client's 401 handler,
 * the logout button — can clear it directly. Without this, switching users
 * in the same tab (logout, then a different login) leaves the previous
 * user's cached responses (e.g. ['requests','all']) sitting in memory,
 * since query keys aren't scoped per-user; a newly-mounted screen can then
 * briefly render another user's — or another branch's — data before its own
 * fetch completes. Clearing on every logout path closes that window.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: 1,
    },
  },
})
