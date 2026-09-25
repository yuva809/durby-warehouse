import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { AlertTriangle, Check, Copy, KeyRound, ShieldAlert } from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, CardHeader } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { Modal } from '../components/ui/Modal'
import { useAuthStore } from '../auth/authStore'
import { isManager, ROLE_LABEL } from '../auth/roles'
import { useIssueResetCode, useUsers } from '../hooks/useUsers'
import { useLocations } from '../hooks/useCatalog'
import { ApiError } from '../lib/apiClient'
import type { ManagedUser, PasswordResetIssued } from '../types'

/**
 * Admin view of accounts, with one action: issue a one-time password reset
 * code. The admin never chooses or sees the user's new password: the user
 * enters the code on the public reset page and picks their own. The rule below
 * only mirrors what the server enforces (managers: branch users and drivers
 * only; admins: anyone but themselves); the server is the authority.
 */
export default function Users() {
  const me = useAuthStore((s) => s.user)
  const { data: users = [], isLoading } = useUsers()
  const { data: locations = [] } = useLocations()
  const issue = useIssueResetCode()
  const [target, setTarget] = useState<ManagedUser | null>(null)
  const [issued, setIssued] = useState<PasswordResetIssued | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)

  if (!isManager(me)) return <Navigate to="/" replace />

  const canReset = (u: ManagedUser) =>
    u.id !== me?.userId && u.active && (me?.role === 'SUPER_ADMIN' || u.role === 'BRANCH_USER' || u.role === 'DRIVER')
  const branchName = (id: string | null) => locations.find((l) => l.id === id)?.name ?? '—'

  async function confirmIssue() {
    if (!target) return
    setError(null)
    try {
      setIssued(await issue.mutateAsync(target.id))
      setTarget(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reach the server')
    }
  }

  function closeIssued() {
    setIssued(null) // the code exists only in this component's state: closing forgets it for good
    setCopied(null)
  }

  async function copy(kind: 'code' | 'link', text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(kind)
    setTimeout(() => setCopied(null), 1800)
  }

  const link = issued ? `${window.location.origin}/reset-password#code=${issued.code}` : ''

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Users" subtitle="Reset a password if someone forgot theirs or an account may be compromised. You never see their new password." />
        {isLoading ? (
          <div className="px-5 py-10 text-center text-sm text-ink-400">Loading…</div>
        ) : users.length === 0 ? (
          <EmptyState title="No users" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-ink-400">
                  <th className="px-5 py-2.5 font-medium">User</th>
                  <th className="px-3 py-2.5 font-medium">Role</th>
                  <th className="px-3 py-2.5 font-medium">Branch</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-ink-100">
                    <td className="px-5 py-3">
                      <div className="font-medium text-ink-800">{u.name}</div>
                      <div className="text-xs text-ink-400">{u.email}</div>
                    </td>
                    <td className="px-3 py-3 text-ink-600">{ROLE_LABEL[u.role]}</td>
                    <td className="px-3 py-3 text-ink-600">{u.role === 'BRANCH_USER' ? branchName(u.locationId) : '—'}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <Badge className={u.active ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-ink-100 text-ink-500 ring-ink-200'}>{u.active ? 'Active' : 'Deactivated'}</Badge>
                        {u.passwordChangeRequired && <Badge className="bg-amber-50 text-amber-700 ring-amber-200">Must set own password</Badge>}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {canReset(u) && (
                        <Button variant="outline" size="sm" className="whitespace-nowrap" icon={<KeyRound size={13} />} onClick={() => { setError(null); setTarget(u) }}>
                          Reset password
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={!!target} onClose={() => setTarget(null)}>
        {target && (
          <div className="space-y-4 p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600"><ShieldAlert size={20} /></div>
              <div>
                <h2 className="font-display text-lg font-semibold text-ink-900">Reset password for {target.name}?</h2>
                <p className="text-sm text-ink-500">{target.email}</p>
              </div>
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink-600">
              <li>Their <b>current password stops working immediately</b> and they are signed out everywhere.</li>
              <li>You get a <b>one-time code</b> (valid 60 minutes) to give them privately.</li>
              <li>They choose their own new password. <b>You will not see it.</b></li>
            </ul>
            {error && <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{error}</div>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button>
              <Button variant="danger" disabled={issue.isPending} onClick={confirmIssue}>{issue.isPending ? 'Working…' : 'Reset and get code'}</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!issued} widthClass="max-w-lg">
        {issued && (
          <div className="space-y-4 p-6">
            <div>
              <h2 className="font-display text-lg font-semibold text-ink-900">One-time reset code for {issued.user.name}</h2>
              <p className="text-sm text-ink-500">Valid until {new Date(issued.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Single use.</p>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-ink-950 px-4 py-3.5">
              <code className="select-all break-all font-mono text-base font-semibold tracking-wider text-white" data-testid="reset-code">{issued.code}</code>
              <button onClick={() => copy('code', issued.code)} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-white/20 cursor-pointer">
                {copied === 'code' ? <Check size={13} /> : <Copy size={13} />} {copied === 'code' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-ink-500">Or send this link (the code stays in the part after # and is never sent to a server)</div>
              <div className="flex items-center gap-2">
                <input readOnly value={link} className="w-full truncate rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600 ring-1 ring-inset ring-ink-200" onFocus={(e) => e.currentTarget.select()} />
                <Button variant="outline" size="sm" onClick={() => copy('link', link)}>{copied === 'link' ? 'Copied' : 'Copy'}</Button>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span><b>This is shown once</b> and cannot be retrieved later. Give it to {issued.user.name} in person or by a private message, not in a group chat or email. If it is lost, just reset again.</span>
            </div>
            <div className="flex justify-end"><Button onClick={closeIssued}>Done</Button></div>
          </div>
        )}
      </Modal>
    </div>
  )
}
