import { useAuthStore } from '../auth/authStore'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://api.localhost/api'

export class ApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, body: unknown) {
    const message = (body as { message?: string | string[] })?.message
    super(Array.isArray(message) ? message.join(', ') : message || `Request failed (${status})`)
    this.status = status
    this.body = body
  }
}

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = useAuthStore.getState().token
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  if (res.status === 401) {
    // Token missing/expired/invalid — the only correct response is to log
    // out client-side; the server is the actual source of truth on this,
    // never a client-side timer.
    useAuthStore.getState().logout()
  }

  const text = await res.text()
  const data = text ? JSON.parse(text) : undefined

  if (!res.ok) throw new ApiError(res.status, data)
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
}
