import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, KeyRound } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { LogoMark } from '../components/layout/LogoMark'
import { authService } from '../services/authService'
import { ApiError } from '../lib/apiClient'

const inputClass =
  'w-full rounded-lg bg-ink-50 px-3 py-2.5 text-sm text-ink-800 outline-none ring-1 ring-inset ring-ink-200 placeholder:text-ink-400 focus:ring-brand-400'

/**
 * Public page: the user is locked out and holds a one-time reset code from an
 * administrator. They choose their OWN new password here; the administrator
 * never sees it. The code may arrive in the link's #fragment (never sent to
 * any server or written to access logs); it is read once and removed from the address bar.
 */
export default function ResetPassword() {
  // Read once at first render (before the effect below removes it from the address bar).
  const [code, setCode] = useState(() => new URLSearchParams(window.location.hash.replace(/^#/, '')).get('code') ?? '')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname)
  }, [])

  async function submit() {
    setError(null)
    if (next !== confirm) {
      setError('The two new passwords do not match.')
      return
    }
    setLoading(true)
    try {
      await authService.resetPassword(code, next)
      setDone(true)
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
            <div className="font-display text-xl font-extrabold tracking-tight text-ink-900">Reset your password</div>
            <div className="mt-1 text-xs font-medium text-ink-400">Enter the one-time code from your administrator and choose a new password.</div>
          </div>
        </div>

        <Card className="p-6">
          {done ? (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="mx-auto text-emerald-500" size={36} />
              <div>
                <div className="font-semibold text-ink-900">Password updated</div>
                <p className="mt-1 text-sm text-ink-500">You can now sign in with your new password.</p>
              </div>
              <Link to="/login">
                <Button className="w-full" size="lg">Go to sign in</Button>
              </Link>
            </div>
          ) : (
            <form
              className="space-y-3.5"
              onSubmit={(e) => {
                e.preventDefault()
                submit()
              }}
            >
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-500">Reset code</label>
                <input
                  required
                  autoFocus={!code}
                  autoComplete="off"
                  spellCheck={false}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className={`${inputClass} font-mono tracking-wider`}
                  placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-500">New password</label>
                <input type="password" required autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={inputClass} />
                <p className="mt-1 text-[11px] text-ink-400">At least 12 characters. Avoid your name or email.</p>
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
                <KeyRound size={16} /> {loading ? 'Saving…' : 'Set new password'}
              </Button>
            </form>
          )}
        </Card>

        {!done && (
          <div className="text-center text-xs">
            <Link to="/login" className="font-medium text-ink-500 hover:text-ink-700">Back to sign in</Link>
          </div>
        )}
      </div>
    </div>
  )
}
