import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, KeyRound, LogOut } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { LogoMark } from '../components/layout/LogoMark'
import { authService } from '../services/authService'
import { useAuthStore } from '../auth/authStore'
import { ApiError } from '../lib/apiClient'
import { queryClient } from '../lib/queryClient'

const inputClass =
  'w-full rounded-lg bg-ink-50 px-3 py-2.5 text-sm text-ink-800 outline-none ring-1 ring-inset ring-ink-200 placeholder:text-ink-400 focus:ring-brand-400'

/**
 * Two uses, one screen. Forced: an admin created this account with an initial
 * password, so nothing else works until the user chooses their own (the server
 * enforces this; this screen is just the way through). Voluntary: reached from
 * the key icon in the top bar. Either way a successful change signs out every
 * other device and this one continues on a fresh session.
 */
export default function ChangePassword() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const setSession = useAuthStore((s) => s.setSession)
  const logout = useAuthStore((s) => s.logout)
  const forced = !!user?.mustChangePassword

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit() {
    setError(null)
    if (next !== confirm) {
      setError('The two new passwords do not match.')
      return
    }
    setLoading(true)
    try {
      const { token, user: fresh } = await authService.changePassword(current, next)
      setSession(token, fresh)
      queryClient.clear()
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server')
    } finally {
      setLoading(false)
    }
  }

  function signOut() {
    logout()
    queryClient.clear()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4">
      <div className="w-full max-w-sm space-y-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white p-2 shadow-lg shadow-ink-900/10">
            <LogoMark className="h-full w-full" />
          </div>
          <div>
            <div className="font-display text-xl font-extrabold tracking-tight text-ink-900">
              {forced ? 'Choose your own password' : 'Change password'}
            </div>
            <div className="mt-1 text-xs font-medium text-ink-400">
              {forced
                ? 'Your account was set up with a temporary password. Choose one only you know before continuing.'
                : 'This signs you out on every other device.'}
            </div>
          </div>
        </div>

        <Card className="p-6">
          <form
            className="space-y-3.5"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">
                {forced ? 'Temporary password you were given' : 'Current password'}
              </label>
              <input type="password" required autoFocus autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">New password</label>
              <input type="password" required autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={inputClass} />
              <p className="mt-1 text-[11px] text-ink-400">At least 12 characters. Avoid your name or email, and anything you use elsewhere.</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">Repeat new password</label>
              <input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" /> <span>{error}</span>
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              <KeyRound size={16} /> {loading ? 'Saving…' : 'Save new password'}
            </Button>
          </form>
        </Card>

        <div className="text-center text-xs">
          {forced ? (
            <button onClick={signOut} className="inline-flex items-center gap-1.5 font-medium text-ink-500 hover:text-ink-700 cursor-pointer">
              <LogOut size={13} /> Sign out
            </button>
          ) : (
            <button onClick={() => navigate(-1)} className="font-medium text-ink-500 hover:text-ink-700 cursor-pointer">
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
