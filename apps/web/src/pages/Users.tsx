import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { AlertTriangle, Check, ChevronRight, Copy, KeyRound, LogOut, MailPlus, Search, ShieldAlert, UserCheck, UserPlus, UserX } from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { Modal } from '../components/ui/Modal'
import { useAuthStore } from '../auth/authStore'
import { isManager, ROLE_LABEL } from '../auth/roles'
import { useUserActions, useUsers } from '../hooks/useUsers'
import { useLocations } from '../hooks/useCatalog'
import { ApiError } from '../lib/apiClient'
import type { ManagedUser, Role, UserStatus } from '../types'

const inputClass =
  'w-full rounded-lg bg-ink-50 px-3 py-2.5 text-sm text-ink-800 outline-none ring-1 ring-inset ring-ink-200 placeholder:text-ink-400 focus:ring-brand-400'

const STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: 'Active',
  DEACTIVATED: 'Deactivated',
  INVITED: 'Invited',
  INVITE_EXPIRED: 'Invitation expired',
  INVITE_REVOKED: 'Invitation revoked',
}
const STATUS_STYLE: Record<UserStatus, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  DEACTIVATED: 'bg-ink-100 text-ink-500 ring-ink-200',
  INVITED: 'bg-sky-50 text-sky-700 ring-sky-200',
  INVITE_EXPIRED: 'bg-amber-50 text-amber-700 ring-amber-200',
  INVITE_REVOKED: 'bg-rose-50 text-rose-700 ring-rose-200',
}

/** What the server lets each role hand out. Mirrors access-policy.ts on the API; the server is the authority. */
function invitableRoles(role: Role | undefined): Role[] {
  if (role === 'SUPER_ADMIN') return ['WAREHOUSE_MANAGER', 'BRANCH_USER', 'DRIVER', 'SUPER_ADMIN']
  if (role === 'WAREHOUSE_MANAGER') return ['BRANCH_USER', 'DRIVER']
  return []
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

type OneTime = { kind: 'invite' | 'reset'; name: string; email: string; code: string; expiresAt: string }
type Confirm = 'deactivate' | 'revoke' | 'signout' | 'reset' | null

/**
 * User & Access Management. Super Admins manage every account; warehouse managers manage branch users and
 * drivers. The buttons below only MIRROR what the server enforces (role, branch and last-admin rules live in the
 * API, apps/api/src/users): hiding a button is never the security boundary.
 * Nobody ever chooses or sees another person's password: invitations and resets give the admin a one-time link/code.
 */
export default function Users() {
  const me = useAuthStore((s) => s.user)
  const { data: users = [], isLoading } = useUsers()
  const { data: locations = [] } = useLocations()
  const actions = useUserActions()

  const [q, setQ] = useState('')
  const [roleFilter, setRoleFilter] = useState<Role | ''>('')
  const [branchFilter, setBranchFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<UserStatus | ''>('')

  const [inviteOpen, setInviteOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [oneTime, setOneTime] = useState<OneTime | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)

  const branches = useMemo(() => locations.filter((l) => l.type === 'BRANCH' && l.active), [locations])
  const branchName = (id: string | null) => locations.find((l) => l.id === id)?.name ?? '—'
  const detail = users.find((u) => u.id === detailId) ?? null

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return users.filter(
      (u) =>
        (!needle || u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle)) &&
        (!roleFilter || u.role === roleFilter) &&
        (!branchFilter || u.locationId === branchFilter) &&
        (!statusFilter || u.status === statusFilter),
    )
  }, [users, q, roleFilter, branchFilter, statusFilter])

  if (!isManager(me)) return <Navigate to="/" replace />

  const canManage = (u: ManagedUser) => u.id !== me?.userId && (me?.role === 'SUPER_ADMIN' || u.role === 'BRANCH_USER' || u.role === 'DRIVER')
  const unaccepted = (u: ManagedUser) => u.status === 'INVITED' || u.status === 'INVITE_EXPIRED' || u.status === 'INVITE_REVOKED'
  const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server')
  const linkFor = (code: string) => `${window.location.origin}/accept-invitation#code=${code}`

  function closeDetail() {
    setDetailId(null)
    setConfirm(null)
    setError(null)
  }
  function closeOneTime() {
    setOneTime(null) // the code exists only in this component's state: closing forgets it for good
    setCopied(null)
  }
  async function copy(kind: 'code' | 'link', text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(kind)
    setTimeout(() => setCopied(null), 1800)
  }

  /** Runs one action, then closes the confirm step (or shows the server's reason). */
  async function run(fn: () => Promise<unknown>, done?: string) {
    setError(null)
    try {
      await fn()
      setConfirm(null)
      if (done) setNotice(done)
    } catch (e) {
      setError(errText(e))
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-ink-900">User &amp; Access Management</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            {me?.role === 'SUPER_ADMIN'
              ? 'Invite and manage warehouse managers, branch users and drivers.'
              : 'Invite and manage branch users and drivers.'}{' '}
            People choose their own password; you never see it.
          </p>
        </div>
        <Button icon={<UserPlus size={15} />} onClick={() => { setError(null); setInviteOpen(true) }}>Invite user</Button>
      </div>

      <AccessHierarchy myRole={me?.role} />

      {notice && (
        <div className="flex items-start justify-between gap-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="cursor-pointer text-xs font-medium underline">Dismiss</button>
        </div>
      )}
      {locations.length > 0 && branches.length === 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>No active branches are set up yet, so branch users can't be invited. Set up the branches first, then invite their staff.</span>
        </div>
      )}
      {locations.length === 0 && !isLoading && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>The warehouse and branches aren't set up yet. Set up the warehouse and branches first (Branches), then invite people and assign them to a branch.</span>
        </div>
      )}

      <Card>
        <div className="grid gap-2 border-b border-ink-100 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" className={`${inputClass} pl-8`} aria-label="Search users" />
          </div>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as Role | '')} className={inputClass} aria-label="Filter by role">
            <option value="">All roles</option>
            {(['SUPER_ADMIN', 'WAREHOUSE_MANAGER', 'BRANCH_USER', 'DRIVER'] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
          <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className={inputClass} aria-label="Filter by branch">
            <option value="">All branches</option>
            {locations.filter((l) => l.type === 'BRANCH').map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as UserStatus | '')} className={inputClass} aria-label="Filter by status">
            <option value="">All statuses</option>
            {(Object.keys(STATUS_LABEL) as UserStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>

        {isLoading ? (
          <div className="px-5 py-10 text-center text-sm text-ink-400">Loading…</div>
        ) : shown.length === 0 ? (
          <EmptyState title={users.length === 0 ? 'No users yet' : 'No users match these filters'} />
        ) : (
          <>
            {/* Desktop / tablet: table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-ink-400">
                    <th className="px-5 py-2.5 font-medium">User</th>
                    <th className="px-3 py-2.5 font-medium">Role</th>
                    <th className="px-3 py-2.5 font-medium">Branch</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">Added</th>
                    <th className="px-5 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((u) => (
                    <tr key={u.id} className="border-t border-ink-100">
                      <td className="px-5 py-3">
                        <div className="font-medium text-ink-800">{u.name}{u.id === me?.userId && <span className="ml-1.5 text-xs font-normal text-ink-400">(you)</span>}</div>
                        <div className="text-xs text-ink-400">{u.email}</div>
                      </td>
                      <td className="px-3 py-3 text-ink-600">{ROLE_LABEL[u.role]}</td>
                      <td className="px-3 py-3 text-ink-600">{u.role === 'BRANCH_USER' ? branchName(u.locationId) : '—'}</td>
                      <td className="px-3 py-3"><StatusCell u={u} /></td>
                      <td className="px-3 py-3 text-xs text-ink-500">{fmtDate(u.createdAt)}</td>
                      <td className="px-5 py-3 text-right">
                        {canManage(u) && <Button variant="outline" size="sm" onClick={() => { setError(null); setConfirm(null); setDetailId(u.id) }}>Manage</Button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Phones: cards */}
            <ul className="divide-y divide-ink-100 md:hidden">
              {shown.map((u) => (
                <li key={u.id} className="space-y-2 px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-ink-800">{u.name}{u.id === me?.userId && <span className="ml-1.5 text-xs font-normal text-ink-400">(you)</span>}</div>
                      <div className="truncate text-xs text-ink-400">{u.email}</div>
                    </div>
                    {canManage(u) && <Button variant="outline" size="sm" onClick={() => { setError(null); setConfirm(null); setDetailId(u.id) }}>Manage</Button>}
                  </div>
                  <div className="text-xs text-ink-500">{ROLE_LABEL[u.role]}{u.role === 'BRANCH_USER' && ` · ${branchName(u.locationId)}`}</div>
                  <StatusCell u={u} />
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        roles={invitableRoles(me?.role)}
        branches={branches}
        onInvite={async (v) => {
          const res = await actions.invite.mutateAsync(v)
          setInviteOpen(false)
          setOneTime({ kind: 'invite', name: res.user.name, email: res.user.email, ...res.invitation })
        }}
        errText={errText}
      />

      {/* User detail / edit / actions */}
      <Modal open={!!detail} onClose={closeDetail} widthClass="max-w-lg">
        {detail && (
          <div className="space-y-5 p-6">
            <div>
              <h2 className="font-display text-lg font-semibold text-ink-900">{detail.name}</h2>
              <p className="text-sm text-ink-500">{detail.email}</p>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-ink-400">Role</dt><dd className="text-ink-800">{ROLE_LABEL[detail.role]}</dd>
              <dt className="text-ink-400">Branch</dt><dd className="text-ink-800">{detail.role === 'BRANCH_USER' ? branchName(detail.locationId) : '—'}</dd>
              <dt className="text-ink-400">Status</dt><dd><Badge className={STATUS_STYLE[detail.status]}>{STATUS_LABEL[detail.status]}</Badge></dd>
              <dt className="text-ink-400">Added</dt><dd className="text-ink-800">{fmtDateTime(detail.createdAt)}</dd>
              {detail.invitation && (
                <>
                  <dt className="text-ink-400">Invited by</dt><dd className="text-ink-800">{detail.invitation.invitedBy ?? '—'}</dd>
                  <dt className="text-ink-400">Invitation sent</dt><dd className="text-ink-800">{fmtDateTime(detail.invitation.sentAt)}</dd>
                  <dt className="text-ink-400">{detail.invitation.acceptedAt ? 'Accepted' : detail.invitation.state === 'PENDING' ? 'Link expires' : 'Link expired'}</dt>
                  <dd className="text-ink-800">{fmtDateTime(detail.invitation.acceptedAt ?? detail.invitation.expiresAt)}</dd>
                </>
              )}
            </dl>

            <EditFields key={detail.id + detail.name + detail.locationId} user={detail} branches={branches} onSave={(v) => run(() => actions.update.mutateAsync({ id: detail.id, ...v }), 'Saved.')} />

            {error && <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{error}</div>}

            {confirm ? (
              <div className="space-y-3 rounded-xl bg-amber-50 p-4">
                <div className="flex items-start gap-2 text-sm text-amber-900">
                  <ShieldAlert size={16} className="mt-0.5 shrink-0" />
                  <span>
                    {confirm === 'deactivate' && <>Deactivate <b>{detail.name}</b>? They are <b>signed out everywhere immediately</b> and can't sign in until you reactivate them.</>}
                    {confirm === 'revoke' && <>Revoke the invitation for <b>{detail.name}</b>? The link stops working and the account is deactivated. You can invite them again later.</>}
                    {confirm === 'signout' && <>Sign <b>{detail.name}</b> out of all devices? Their password stays the same.</>}
                    {confirm === 'reset' && <>Reset the password for <b>{detail.name}</b>? Their <b>current password stops working immediately</b>; you get a one-time code to give them privately.</>}
                  </span>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setConfirm(null)}>Cancel</Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      const id = detail.id
                      if (confirm === 'deactivate') run(() => actions.deactivate.mutateAsync(id), `${detail.name} was deactivated and signed out everywhere.`)
                      if (confirm === 'revoke') run(() => actions.revokeInvitation.mutateAsync(id), 'Invitation revoked.')
                      if (confirm === 'signout') run(() => actions.revokeSessions.mutateAsync(id), `${detail.name} was signed out of all devices.`)
                      if (confirm === 'reset')
                        run(async () => {
                          const r = await actions.issueResetCode.mutateAsync(id)
                          closeDetail()
                          setOneTime({ kind: 'reset', name: r.user.name, email: r.user.email, code: r.code, expiresAt: r.expiresAt })
                        })
                    }}
                  >
                    Confirm
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {unaccepted(detail) && (
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<MailPlus size={13} />}
                    onClick={() =>
                      run(async () => {
                        const r = await actions.resendInvitation.mutateAsync(detail.id)
                        closeDetail()
                        setOneTime({ kind: 'invite', name: r.user.name, email: r.user.email, ...r.invitation })
                      })
                    }
                  >
                    {detail.status === 'INVITED' ? 'Resend (new link)' : 'Send new invitation'}
                  </Button>
                )}
                {detail.status === 'INVITED' && <Button variant="outline" size="sm" icon={<UserX size={13} />} onClick={() => setConfirm('revoke')}>Revoke invitation</Button>}
                {detail.status === 'ACTIVE' && (
                  <>
                    <Button variant="outline" size="sm" icon={<KeyRound size={13} />} onClick={() => setConfirm('reset')}>Reset password</Button>
                    <Button variant="outline" size="sm" icon={<LogOut size={13} />} onClick={() => setConfirm('signout')}>Sign out everywhere</Button>
                    <Button variant="outline" size="sm" icon={<UserX size={13} />} onClick={() => setConfirm('deactivate')}>Deactivate</Button>
                  </>
                )}
                {detail.status === 'DEACTIVATED' && (
                  <Button size="sm" icon={<UserCheck size={13} />} onClick={() => run(() => actions.reactivate.mutateAsync(detail.id), `${detail.name} was reactivated.`)}>Reactivate</Button>
                )}
              </div>
            )}
            <div className="flex justify-end"><Button variant="ghost" size="sm" onClick={closeDetail}>Close</Button></div>
          </div>
        )}
      </Modal>

      {/* One-time link / code (invitation or reset): shown once */}
      <Modal open={!!oneTime} widthClass="max-w-lg">
        {oneTime && (
          <div className="space-y-4 p-6">
            <div>
              <h2 className="font-display text-lg font-semibold text-ink-900">
                {oneTime.kind === 'invite' ? `Invitation for ${oneTime.name}` : `One-time reset code for ${oneTime.name}`}
              </h2>
              <p className="text-sm text-ink-500">
                {oneTime.email} · valid until {fmtDateTime(oneTime.expiresAt)} · single use
              </p>
            </div>
            {oneTime.kind === 'invite' ? (
              <div>
                <div className="mb-1 text-xs font-medium text-ink-500">Send them this link. They open it and choose their own password.</div>
                <div className="flex items-center gap-2">
                  <input readOnly value={linkFor(oneTime.code)} data-testid="invite-link" className="w-full truncate rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600 ring-1 ring-inset ring-ink-200" onFocus={(e) => e.currentTarget.select()} />
                  <Button variant="outline" size="sm" onClick={() => copy('link', linkFor(oneTime.code))}>{copied === 'link' ? 'Copied' : 'Copy'}</Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 rounded-xl bg-ink-950 px-4 py-3.5">
                  <code className="select-all break-all font-mono text-base font-semibold tracking-wider text-white" data-testid="reset-code">{oneTime.code}</code>
                  <button onClick={() => copy('code', oneTime.code)} className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-white/20">
                    {copied === 'code' ? <Check size={13} /> : <Copy size={13} />} {copied === 'code' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-ink-500">Or send this link (the code stays in the part after # and is never sent to a server)</div>
                  <div className="flex items-center gap-2">
                    <input readOnly value={`${window.location.origin}/reset-password#code=${oneTime.code}`} className="w-full truncate rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600 ring-1 ring-inset ring-ink-200" onFocus={(e) => e.currentTarget.select()} />
                    <Button variant="outline" size="sm" onClick={() => copy('link', `${window.location.origin}/reset-password#code=${oneTime.code}`)}>{copied === 'link' ? 'Copied' : 'Copy'}</Button>
                  </div>
                </div>
              </>
            )}
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                <b>This is shown once</b> and cannot be retrieved later (only a hash is stored). Give it to {oneTime.name} in person or by a private message, not a group chat.
                Nothing is emailed automatically. If it is lost, {oneTime.kind === 'invite' ? 'choose "Resend" for a new link' : 'reset again'}.
              </span>
            </div>
            <div className="flex justify-end"><Button onClick={closeOneTime}>Done</Button></div>
          </div>
        )}
      </Modal>
    </div>
  )
}

/** Who can create and manage whom. Mirrors the server's rules (apps/api/src/users/access-policy.ts); the server is the authority. */
function AccessHierarchy({ myRole }: { myRole?: Role }) {
  const tiers: { role: string; who: string; text: string; mine: boolean }[] = [
    { role: 'Super Admin', who: 'SUPER_ADMIN', text: 'Creates Warehouse Managers and manages every account. The only role that can create another Super Admin.', mine: myRole === 'SUPER_ADMIN' },
    { role: 'Warehouse Manager', who: 'WAREHOUSE_MANAGER', text: 'Invites and manages Branch users and Drivers. Cannot create or change Super Admins or other managers, or themselves.', mine: myRole === 'WAREHOUSE_MANAGER' },
    { role: 'Branch users & Drivers', who: 'BRANCH_USER', text: 'Branch users see only their own branch; drivers only handle deliveries. Neither manages other users.', mine: false },
  ]
  return (
    <Card className="p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Who can manage whom</div>
      <ol className="grid gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch">
        {tiers.flatMap((t, i) => [
          <li key={t.who} className={`rounded-lg px-3 py-2.5 text-xs ring-1 ring-inset ${t.mine ? 'bg-brand-50 ring-brand-200' : 'bg-ink-50 ring-ink-200'}`}>
            <div className="font-semibold text-ink-800">{t.role}{t.mine && <span className="ml-1.5 font-normal text-brand-600">(you)</span>}</div>
            <div className="mt-0.5 text-ink-500">{t.text}</div>
          </li>,
          ...(i < tiers.length - 1 ? [<li key={`${t.who}-arrow`} aria-hidden className="hidden items-center text-ink-300 md:flex"><ChevronRight size={16} /></li>] : []),
        ])}
      </ol>
    </Card>
  )
}

function StatusCell({ u }: { u: ManagedUser }) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1.5">
        <Badge className={STATUS_STYLE[u.status]}>{STATUS_LABEL[u.status]}</Badge>
        {u.passwordChangeRequired && <Badge className="bg-amber-50 text-amber-700 ring-amber-200">Must set own password</Badge>}
      </div>
      {u.invitation && u.invitation.state === 'PENDING' && <div className="text-[11px] text-ink-400">Link expires {fmtDateTime(u.invitation.expiresAt)}</div>}
      {u.invitation && u.invitation.state === 'ACCEPTED' && u.invitation.acceptedAt && <div className="text-[11px] text-ink-400">Joined {fmtDate(u.invitation.acceptedAt)}</div>}
    </div>
  )
}

/** Name always; branch only for branch users. Role is fixed (there is deliberately no way to change it). */
function EditFields({ user, branches, onSave }: { user: ManagedUser; branches: { id: string; name: string }[]; onSave: (v: { name?: string; locationId?: string }) => void }) {
  const [name, setName] = useState(user.name)
  const [branch, setBranch] = useState(user.locationId ?? '')
  const dirty = name.trim() !== user.name || (user.role === 'BRANCH_USER' && branch !== (user.locationId ?? ''))
  return (
    <div className="space-y-3 border-t border-ink-100 pt-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-400">Edit</div>
      <div>
        <label className="mb-1 block text-xs font-medium text-ink-500">Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} maxLength={120} />
      </div>
      {user.role === 'BRANCH_USER' && (
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">Branch</label>
          <select value={branch} onChange={(e) => setBranch(e.target.value)} className={inputClass}>
            {!branches.some((b) => b.id === user.locationId) && user.locationId && <option value={user.locationId}>Current branch (inactive)</option>}
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}
      <Button size="sm" disabled={!dirty || !name.trim()} onClick={() => onSave({ ...(name.trim() !== user.name && { name: name.trim() }), ...(user.role === 'BRANCH_USER' && branch !== user.locationId && { locationId: branch }) })}>Save changes</Button>
    </div>
  )
}

function InviteModal({
  open,
  onClose,
  roles,
  branches,
  onInvite,
  errText,
}: {
  open: boolean
  onClose: () => void
  roles: Role[]
  branches: { id: string; name: string }[]
  onInvite: (v: { email: string; name: string; role: Role; locationId?: string }) => Promise<void>
  errText: (e: unknown) => string
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>(roles[0])  // the first role the inviter may hand out: Warehouse Manager for a Super Admin, Branch for a manager
  const [branch, setBranch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const needsBranch = role === 'BRANCH_USER'
  const noBranches = needsBranch && branches.length === 0

  async function submit() {
    setError(null)
    setBusy(true)
    try {
      await onInvite({ email: email.trim(), name: name.trim(), role, ...(needsBranch && { locationId: branch }) })
      setName('')
      setEmail('')
      setBranch('')
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <form
        className="space-y-4 p-6"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-900">Invite a user</h2>
          <p className="text-sm text-ink-500">They get a one-time link to set their own password. You won't see it.</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">Full name</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} maxLength={120} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">Email (their sign-in)</label>
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} autoComplete="off" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-500">Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={inputClass}>
            {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </div>
        {needsBranch && (
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">Branch</label>
            <select required value={branch} onChange={(e) => setBranch(e.target.value)} className={inputClass} disabled={noBranches}>
              <option value="">{noBranches ? 'No branches set up yet' : 'Choose a branch…'}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            {noBranches && <p className="mt-1 text-[11px] text-amber-700">Set up the branches first; branch users must belong to one.</p>}
          </div>
        )}
        {error && <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{error}</div>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy || noBranches}>{busy ? 'Inviting…' : 'Create invitation'}</Button>
        </div>
      </form>
    </Modal>
  )
}
