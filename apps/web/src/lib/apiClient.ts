import { useAuthStore } from '../auth/authStore'
import { queryClient } from './queryClient'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://api.localhost/api'

/** Token missing/expired/invalid — clears both the session and the cache, so the next login in this tab never renders a leftover response from this one (see queryClient.ts). */
function forceLogout() {
  useAuthStore.getState().logout()
  queryClient.clear()
}

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
    // The server is the actual source of truth on this, never a client-side timer.
    forceLogout()
  }

  const text = await res.text()
  const data = text ? JSON.parse(text) : undefined

  // The server enforces "choose your own password first"; if we ever get here without knowing it
  // (e.g. a stale persisted session), flip the flag so the router sends the user to the change screen.
  if (res.status === 403 && (data as { code?: string } | undefined)?.code === 'PASSWORD_CHANGE_REQUIRED') {
    useAuthStore.getState().setMustChangePassword(true)
  }

  if (res.status === 429) throw new ApiError(429, { message: 'Too many attempts. Please wait a minute and try again.' })
  if (!res.ok) throw new ApiError(res.status, data)
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  /**
   * For authenticated file downloads (PDFs) — plain <a href> can't carry the
   * Authorization header, so the caller fetches the bytes here, then hands
   * the blob to triggerDownload below.
   */
  /** For multipart uploads (supplier invoice files) — the browser sets the correct Content-Type/boundary itself, so it must NOT be set manually here. */
  async postForm<T>(path: string, form: FormData): Promise<T> {
    const token = useAuthStore.getState().token
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: form,
    })
    if (res.status === 401) forceLogout()
    const text = await res.text()
    const data = text ? JSON.parse(text) : undefined
    if (!res.ok) throw new ApiError(res.status, data)
    return data as T
  },
  async getBlob(path: string): Promise<Blob> {
    const token = useAuthStore.getState().token
    const res = await fetch(`${API_URL}${path}`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
    if (res.status === 401) forceLogout()
    if (!res.ok) {
      const text = await res.text()
      throw new ApiError(res.status, text ? JSON.parse(text) : undefined)
    }
    return res.blob()
  },
}

/** Saves a blob to disk under `filename` using a throwaway object URL, same as a normal browser download. */
export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
