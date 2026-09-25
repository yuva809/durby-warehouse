import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogIn, AlertTriangle } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { LogoMark } from '../components/layout/LogoMark'
import { authService } from '../services/authService'
import { useAuthStore } from '../auth/authStore'
import { ApiError } from '../lib/apiClient'

// Dev/demo convenience only — logs in for real as one of the seeded accounts
// rather than bypassing auth, so the backend's actual RBAC is still what's
// being exercised. Not shown/usable in a way that skips authentication.
const DEMO_ACCOUNTS = [
  { email: 'admin@durby.tech', label: 'Super Admin' },
  { email: 'manager@durby.tech', label: 'Warehouse Manager' },
  { email: 'wilhelm@durby.tech', label: 'Wilhelmstraße 2 (Branch)' },
  { email: 'kurfursten@durby.tech', label: 'Kurfürstenstraße 33 (Branch)' },
  { email: 'mike@durby.tech', label: 'Mike (Driver)' },
]

export default function Login() {
  const navigate = useNavigate()
  const setSession = useAuthStore((s) => s.setSession)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function doLogin(loginEmail: string, loginPassword: string) {
    setError(null)
    setLoading(true)
    try {
      const { token, user } = await authService.login(loginEmail, loginPassword)
      setSession(token, user)
      navigate(user.mustChangePassword ? '/change-password' : '/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4">
      <div className="w-full max-w-sm space-y-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white p-2 shadow-lg shadow-ink-900/10">
            <LogoMark className="h-full w-full" />
          </div>
          <div>
            <div className="font-display text-xl font-extrabold tracking-tight text-ink-900">ASIA MIGHT</div>
            <div className="text-xs font-medium text-ink-400">Super Market</div>
          </div>
        </div>

        <Card className="p-6">
          <form
            className="space-y-3.5"
            onSubmit={(e) => {
              e.preventDefault()
              doLogin(email, password)
            }}
          >
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">Email</label>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg bg-ink-50 px-3 py-2.5 text-sm text-ink-800 outline-none ring-1 ring-inset ring-ink-200 placeholder:text-ink-400 focus:ring-brand-400"
                placeholder="you@durby.tech"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg bg-ink-50 px-3 py-2.5 text-sm text-ink-800 outline-none ring-1 ring-inset ring-ink-200 focus:ring-brand-400"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                <AlertTriangle size={14} className="shrink-0" /> {error}
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              <LogIn size={16} /> {loading ? 'Signing in…' : 'Sign in'}
            </Button>
            <div className="text-center">
              <Link to="/reset-password" className="text-xs font-medium text-ink-500 hover:text-ink-700">
                Have a reset code from your administrator?
              </Link>
            </div>
          </form>
        </Card>

        {import.meta.env.VITE_SHOW_DEMO_LOGINS === 'true' && (
          <Card className="p-4">
            <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              Demo accounts (dev only)
            </div>
            <div className="space-y-1">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  disabled={loading}
                  onClick={() => doLogin(acc.email, import.meta.env.VITE_SEED_DEMO_PASSWORD ?? 'ChangeMe123!')}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm text-ink-700 hover:bg-ink-50 disabled:opacity-50 cursor-pointer"
                >
                  <span>{acc.label}</span>
                  <span className="text-xs text-ink-400">{acc.email}</span>
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
