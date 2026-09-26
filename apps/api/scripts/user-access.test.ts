/**
 * End-to-end tests for User & Access Management: invitations, role/branch authorization,
 * deactivation and session revocation, last-Super-Admin protection, audit events, and the
 * access boundaries of branch users and drivers.
 *
 * Fully self-contained and disposable: creates a scratch Postgres database and a scratch Redis
 * container, applies the real migrations, creates the first admin with the real bootstrap CLI,
 * starts the COMPILED API (dist/) on a scratch port and drives the real HTTP endpoints. The
 * database in DATABASE_URL is never written. The last-admin guard is also exercised in-process
 * (compiled UsersService against the same scratch database) so it is tested deterministically.
 *
 * Run with: npm run test:user-access   (builds first; needs Docker and a Postgres role that can CREATE DATABASE)
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { Queue } from 'bullmq';
import { PrismaClient } from '@prisma/client';

const BASE_URL = process.env.DATABASE_URL;
if (!BASE_URL) throw new Error('DATABASE_URL is required (points at a Postgres that may CREATE DATABASE)');
const API_DIR = process.cwd();
const PORT = 3940 + Math.floor(Math.random() * 20);
const REDIS_PORT = 6410 + Math.floor(Math.random() * 9);
const REDIS_NAME = `durby-uatest-redis-${process.pid}`;
const JWT_SECRET = 'uatest-' + 'x'.repeat(48);
const API = `http://127.0.0.1:${PORT}/api`;

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) {
    pass++;
    console.log(`✓ ${label}`);
  } else {
    fail++;
    console.log(`✗ FAIL: ${label}`);
  }
}
const secrets: string[] = []; // every password and invitation/reset code used: none may reach logs or audit jobs
const secret = <T extends string>(s: T): T => (secrets.push(s), s);

let ipCounter = 10;
async function call(method: string, path: string, opts: { token?: string; body?: unknown } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `198.51.100.${ipCounter++ % 250}`, ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try { data = text ? JSON.parse(text) : undefined; } catch { data = text; }
  return { status: res.status, data, headers: res.headers, raw: text };
}
const login = (email: string, password: string) => call('POST', '/auth/login', { body: { email, password } });
const sh = (cmd: string, args: string[], env: Record<string, string> = {}) => spawnSync(cmd, args, { cwd: API_DIR, env: { ...process.env, ...env }, encoding: 'utf8' });
const urlFor = (db: string) => { const u = new URL(BASE_URL!); u.pathname = `/${db}`; return u.toString(); };
const CODE_RE = /^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/;
const ANY_CODE_RE = /[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}/;

async function main() {
  const dbName = `uaflow_${Date.now()}`;
  const admin = new PrismaClient({ datasourceUrl: BASE_URL });
  let server: ChildProcess | undefined;
  let serverLog = '';
  let prisma: PrismaClient | undefined;
  let redisUp = false;
  let appCtx: { close: () => Promise<void> } | undefined;
  let crashed = false;

  try {
    // ---------------- infrastructure ----------------
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
    const dbUrl = urlFor(dbName);
    const mig = sh('npx', ['prisma', 'migrate', 'deploy'], { DATABASE_URL: dbUrl });
    if (mig.status !== 0) throw new Error('migrate deploy failed: ' + mig.stderr);
    const run = spawnSync('docker', ['run', '-d', '--rm', '--name', REDIS_NAME, '-p', `${REDIS_PORT}:6379`, 'redis:7-alpine'], { encoding: 'utf8' });
    if (run.status !== 0) throw new Error('could not start scratch redis: ' + run.stderr);
    redisUp = true;
    for (let i = 0; i < 30; i++) { if (spawnSync('docker', ['exec', REDIS_NAME, 'redis-cli', 'ping'], { encoding: 'utf8' }).stdout.includes('PONG')) break; await new Promise((r) => setTimeout(r, 300)); }

    const OWNER = 'owner@uatest-company.io';
    const OWNER_PW = secret('Zebra-Quartz-Meadow-2026x');
    const boot = sh('npx', ['tsx', 'prisma/bootstrap-admin.ts'], { DATABASE_URL: dbUrl, ADMIN_EMAIL: OWNER, ADMIN_NAME: 'Test Owner', ADMIN_PASSWORD: OWNER_PW, BOOTSTRAP_CONFIRM_DB: dbName });
    if (boot.status !== 0) throw new Error('bootstrap failed: ' + boot.stdout + boot.stderr);

    const serverEnv = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', DATABASE_URL: dbUrl, PORT: String(PORT), NODE_ENV: 'production', JWT_SECRET,
      REDIS_HOST: '127.0.0.1', REDIS_PORT: String(REDIS_PORT), REDIS_PASSWORD: '', CORS_ORIGIN: 'http://localhost', TRUST_PROXY: '127.0.0.1' };
    server = spawn('node', ['dist/main.js'], { cwd: API_DIR, env: serverEnv });
    server.stdout!.on('data', (d) => (serverLog += d));
    server.stderr!.on('data', (d) => (serverLog += d));
    for (let i = 0; i < 60; i++) { try { if ((await fetch(`${API}/health`)).ok) break; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 500)); }
    prisma = new PrismaClient({ datasourceUrl: dbUrl });

    const ownerLogin = await login(OWNER, OWNER_PW);
    let ownerTok: string = ownerLogin.data.accessToken;
    const ownerId: string = ownerLogin.data.user.id;

    // small helpers
    const invite = (token: string, body: Record<string, unknown>) => call('POST', '/users/invitations', { token, body });
    const accept = (code: string, password: string) => call('POST', '/auth/accept-invitation', { body: { code, newPassword: password } });
    const userCount = () => prisma!.user.count();
    const dbUser = (email: string) => prisma!.user.findUniqueOrThrow({ where: { email } });
    /** Invite + accept + log in: returns id/token. */
    async function onboard(inviterTok: string, email: string, name: string, role: string, pw: string, locationId?: string) {
      secret(pw);
      const inv = await invite(inviterTok, { email, name, role, ...(locationId ? { locationId } : {}) });
      if (inv.status !== 201) throw new Error(`onboard invite failed for ${email}: ${inv.status} ${inv.raw}`);
      secret(inv.data.invitation.code);
      const acc = await accept(inv.data.invitation.code, pw);
      if (acc.status !== 200) throw new Error(`onboard accept failed for ${email}: ${acc.status} ${acc.raw}`);
      const l = await login(email, pw);
      if (l.status !== 200) throw new Error(`onboard login failed for ${email}`);
      return { id: inv.data.user.id as string, token: l.data.accessToken as string, email };
    }

    // ================= A. setup sequence + invitation basics =================
    console.log('\n== A. Super Admin invites the warehouse manager (before any location exists) ==');
    const MGR_PW = secret('Harbor-Lantern-Velvet-8842q');
    const invM = await invite(ownerTok, { email: 'mgr@uatest-company.io', name: 'Warehouse Lead', role: 'WAREHOUSE_MANAGER' });
    ok(invM.status === 201 && CODE_RE.test(invM.data.invitation.code), 'Super Admin invites a WAREHOUSE_MANAGER: 201 with a one-time invitation code');
    secret(invM.data.invitation.code);
    ok(invM.data.user.status === 'INVITED' && invM.data.user.role === 'WAREHOUSE_MANAGER' && !('passwordHash' in invM.data.user) && !JSON.stringify(invM.data).includes('passwordHash'), '...the account is listed as INVITED and no password data is returned');
    ok(/no-store/.test(invM.headers.get('cache-control') ?? ''), '...and the response is marked no-store');
    const invRow = await prisma.userInvitation.findFirstOrThrow({ where: { userId: invM.data.user.id } });
    const compact = invM.data.invitation.code.replace(/-/g, '');
    ok(/^[0-9a-f]{64}$/.test(invRow.tokenHash) && !invRow.tokenHash.includes(compact) && !JSON.stringify(invRow).includes(compact), 'only a SHA-256 hash of the invitation is stored, never the code');
    ok(new Date(invRow.expiresAt).getTime() - Date.now() > 70 * 3_600_000 && new Date(invRow.expiresAt).getTime() - Date.now() < 73 * 3_600_000, '...and it expires after about 72 hours');
    ok((await login('mgr@uatest-company.io', MGR_PW)).status === 401 && (await login('mgr@uatest-company.io', 'password12345')).status === 401, 'the invited person cannot sign in before accepting (the account has no usable password)');
    const usersBefore = await userCount();
    const noBranch = await invite(ownerTok, { email: 'early.branch@uatest-company.io', name: 'Early Branch', role: 'BRANCH_USER', locationId: 'cknotarealbranch000000000' });
    ok(noBranch.status === 400 && /branch/i.test(JSON.stringify(noBranch.data)), 'with no branches configured yet, a branch user cannot be invited (400: set up branches first)');
    ok((await userCount()) === usersBefore, '...and no half-created account is left behind');
    const noBranch2 = await invite(ownerTok, { email: 'early.branch@uatest-company.io', name: 'Early Branch', role: 'BRANCH_USER' });
    ok(noBranch2.status === 400, 'a branch user without any branch is refused');

    console.log('\n== A2. the invitee accepts and sets their own password ==');
    const weak = await accept(invM.data.invitation.code, 'short');
    ok(weak.status === 400 && Array.isArray(weak.data.message), 'a weak password is refused with the reasons');
    const withName = await accept(invM.data.invitation.code, secret('mgr-Password-2026-zz'));
    ok(withName.status === 400 && /email name/i.test(JSON.stringify(withName.data)), 'a password containing their email name is refused');
    ok((await prisma.userInvitation.findUniqueOrThrow({ where: { id: invRow.id } })).acceptedAt === null, '...and a refused attempt does not consume the invitation');
    const tvBefore = (await dbUser('mgr@uatest-company.io')).tokenVersion;
    const acc = await accept(invM.data.invitation.code, MGR_PW);
    ok(acc.status === 200, 'a valid password activates the account');
    const mgrLogin = await login('mgr@uatest-company.io', MGR_PW);
    ok(mgrLogin.status === 200 && mgrLogin.data.mustChangePassword === false, 'the manager signs in with the password they chose and is not forced to change it again');
    ok((await dbUser('mgr@uatest-company.io')).tokenVersion === tvBefore + 1, 'accepting bumps tokenVersion (no earlier token can exist for them)');
    const mgrTok: string = mgrLogin.data.accessToken;
    const mgrId: string = mgrLogin.data.user.id;
    const reuse = await accept(invM.data.invitation.code, secret('Another-Fine-Passphrase-71!'));
    ok(reuse.status === 400, 'the same invitation cannot be used twice');

    // ================= B. locations =================
    const wh = (await call('POST', '/locations', { token: ownerTok, body: { name: 'UA Warehouse', type: 'WAREHOUSE' } })).data.id as string;
    const B1 = (await call('POST', '/locations', { token: ownerTok, body: { name: 'UA Branch One', type: 'BRANCH' } })).data.id as string;
    const B2 = (await call('POST', '/locations', { token: ownerTok, body: { name: 'UA Branch Two', type: 'BRANCH' } })).data.id as string;
    const B3 = (await call('POST', '/locations', { token: ownerTok, body: { name: 'UA Closed Branch', type: 'BRANCH' } })).data.id as string;
    await call('POST', `/locations/${B3}/deactivate`, { token: ownerTok });

    // ================= C. manager invites branch users =================
    console.log('\n== C. Warehouse Manager invites branch users (and is denied for anything else) ==');
    const BU1_PW = 'Copper-Willow-Sunrise-5310k';
    const invB1 = await invite(mgrTok, { email: 'branch1@uatest-company.io', name: 'Branch One Staff', role: 'BRANCH_USER', locationId: B1 });
    ok(invB1.status === 201 && invB1.data.user.locationId === B1 && invB1.data.user.role === 'BRANCH_USER', 'the manager invites a BRANCH_USER into an authorized (active) branch: 201');
    secret(invB1.data.invitation.code);
    const before = await userCount();
    const denied: [string, Record<string, unknown>, number][] = [
      ['an INACTIVE branch', { email: 'x1@uatest-company.io', name: 'X', role: 'BRANCH_USER', locationId: B3 }, 400],
      ['the WAREHOUSE location', { email: 'x2@uatest-company.io', name: 'X', role: 'BRANCH_USER', locationId: wh }, 400],
      ['a location id that does not exist', { email: 'x3@uatest-company.io', name: 'X', role: 'BRANCH_USER', locationId: 'ckdoesnotexist00000000000' }, 400],
      ['no branch at all', { email: 'x4@uatest-company.io', name: 'X', role: 'BRANCH_USER' }, 400],
      ['a driver with a branch attached', { email: 'x5@uatest-company.io', name: 'X', role: 'DRIVER', locationId: B1 }, 400],
    ];
    for (const [label, body, want] of denied) {
      const r = await invite(mgrTok, body);
      ok(r.status === want, `manager denied: ${label} (${r.status})`);
    }
    ok((await invite(mgrTok, { email: 'x6@uatest-company.io', name: 'X', role: 'SUPER_ADMIN' })).status === 403, 'manager denied: inviting a SUPER_ADMIN (403)');
    ok((await invite(mgrTok, { email: 'x7@uatest-company.io', name: 'X', role: 'WAREHOUSE_MANAGER' })).status === 403, 'manager denied: inviting another WAREHOUSE_MANAGER (403)');
    ok((await invite(mgrTok, { email: 'x8@uatest-company.io', name: 'X', role: 'GOD_MODE' })).status === 400, 'an unknown role is rejected by validation (400)');
    ok((await invite(mgrTok, { email: 'x9@uatest-company.io', name: 'X', role: 'DRIVER', password: 'sneaky-known-password' })).status === 400, 'a password field is not accepted on an invitation (400): nobody chooses another person\'s password');
    ok((await userCount()) === before, 'none of the denied invitations created an account');

    const acceptedBu1 = await accept(invB1.data.invitation.code, secret(BU1_PW));
    ok(acceptedBu1.status === 200, 'the invited branch user accepts and sets their own password');
    const bu1 = { id: invB1.data.user.id as string, token: (await login('branch1@uatest-company.io', BU1_PW)).data.accessToken as string };
    const drv = await onboard(mgrTok, 'driver@uatest-company.io', 'Test Driver', 'DRIVER', 'Maple-Ferry-Granite-6607p');
    const bu2 = await onboard(mgrTok, 'branch2@uatest-company.io', 'Branch Two Staff', 'BRANCH_USER', 'Cedar-Anchor-Pebble-3391m', B2);
    ok(!!drv.id && !!bu2.id, 'the manager can also invite drivers (the existing model: managers dispatch drivers)');
    // Super Admin creates more admin-level accounts
    const sa2 = await onboard(ownerTok, 'admin2@uatest-company.io', 'Second Admin', 'SUPER_ADMIN', 'Indigo-Harvest-Falcon-9120x');
    const mgr2 = await onboard(ownerTok, 'mgr2@uatest-company.io', 'Other Manager', 'WAREHOUSE_MANAGER', 'Saffron-Delta-Compass-4487w');
    ok(!!sa2.id && !!mgr2.id, 'only a Super Admin can create another SUPER_ADMIN and WAREHOUSE_MANAGER accounts (both created by the owner)');

    // ================= D. manager can't touch higher roles; bypasses closed =================
    console.log('\n== D. manager cannot manage or elevate higher-role accounts ==');
    const mList = await call('GET', '/users', { token: mgrTok });
    const mEmails: string[] = mList.data.map((u: any) => u.email);
    ok(mList.status === 200 && !mEmails.includes(OWNER) && !mEmails.includes('admin2@uatest-company.io') && !mEmails.includes('mgr2@uatest-company.io'), 'the manager\'s user list hides Super Admin and other manager accounts');
    ok(mEmails.includes('mgr@uatest-company.io') && mEmails.includes('branch1@uatest-company.io') && mEmails.includes('driver@uatest-company.io'), '...but includes themselves, branch users and drivers');
    const oList = await call('GET', '/users', { token: ownerTok });
    ok(oList.data.length === (await userCount()), 'the Super Admin sees every account');
    ok((await call('GET', `/users?role=DRIVER`, { token: ownerTok })).data.every((u: any) => u.role === 'DRIVER'), 'the role filter works');
    ok((await call('GET', `/users?locationId=${B1}`, { token: ownerTok })).data.every((u: any) => u.locationId === B1), 'the branch filter works');
    ok((await call('GET', `/users?role=NOPE`, { token: ownerTok })).status === 400, '...and an invalid filter value is rejected');
    const hi: [string, string][] = [['the Super Admin', ownerId], ['another manager', mgr2.id], ['a second Super Admin', sa2.id], ['themselves', mgrId]];
    for (const [label, tid] of hi) {
      const codes = await Promise.all([
        call('PATCH', `/users/${tid}`, { token: mgrTok, body: { name: 'Hijacked' } }),
        call('POST', `/users/${tid}/deactivate`, { token: mgrTok }),
        call('POST', `/users/${tid}/reactivate`, { token: mgrTok }),
        call('POST', `/users/${tid}/revoke-sessions`, { token: mgrTok }),
        call('POST', `/users/${tid}/reset-password`, { token: mgrTok }),
        call('POST', `/users/${tid}/invitation/resend`, { token: mgrTok }),
        call('POST', `/users/${tid}/invitation/revoke`, { token: mgrTok }),
      ]);
      ok(codes.every((c) => c.status === 403 || (tid === mgrId && c.status === 400)), `manager cannot edit/deactivate/reactivate/sign-out/reset/resend/revoke ${label} (${codes.map((c) => c.status).join(',')})`);
    }
    ok((await dbUser(OWNER)).name === 'Test Owner' && (await dbUser('mgr2@uatest-company.io')).active, '...and none of those had any effect');
    ok((await call('PATCH', `/users/${bu1.id}`, { token: mgrTok, body: { role: 'SUPER_ADMIN' } })).status === 400, 'role cannot be changed through the API at all (no promotion path: 400)');
    ok((await call('PATCH', `/users/${bu1.id}`, { token: mgrTok, body: { active: false } })).status === 400, 'active cannot be flipped through PATCH (use deactivate, which ends sessions): 400');
    ok((await call('PATCH', `/users/${bu1.id}`, { token: mgrTok, body: { email: 'steal@uatest-company.io' } })).status === 400, 'email cannot be edited (400)');
    ok((await dbUser('branch1@uatest-company.io')).role === 'BRANCH_USER', '...the branch user is unchanged');
    ok((await call('POST', `/locations/${B2}/assign-user/${ownerId}`, { token: mgrTok })).status === 403, 'the old locations/assign-user route can no longer be used to reassign a Super Admin (403)');
    ok((await call('POST', `/locations/${B2}/assign-user/${mgr2.id}`, { token: mgrTok })).status === 403 && (await dbUser('mgr2@uatest-company.io')).locationId === null, '...or another manager');
    ok((await call('POST', `/locations/${wh}/assign-user/${bu1.id}`, { token: mgrTok })).status === 400, '...and a branch user cannot be assigned to the warehouse (400)');
    ok((await call('POST', `/locations/${B1}/assign-user/${drv.id}`, { token: mgrTok })).status === 400, '...nor can a driver be given a branch (400)');
    const mv = await call('PATCH', `/users/${bu1.id}`, { token: mgrTok, body: { locationId: B2 } });
    ok(mv.status === 200 && mv.data.locationId === B2, 'a manager may move a branch user to another valid branch');
    ok((await call('PATCH', `/users/${bu1.id}`, { token: mgrTok, body: { locationId: B3 } })).status === 400, '...but not to an inactive branch (400)');
    ok((await call('PATCH', `/users/${bu1.id}`, { token: mgrTok, body: { locationId: 'ckunknown0000000000000000' } })).status === 400, '...nor to an unknown location (400: never trust a client-supplied locationId)');
    const back = await call('POST', `/locations/${B1}/assign-user/${bu1.id}`, { token: mgrTok });
    ok(back.status === 201 && (await dbUser('branch1@uatest-company.io')).locationId === B1, 'the assign-user route still works for a valid branch and branch user (it now goes through the same rules)');
    ok((await call('POST', '/users', { token: mgrTok, body: { email: 'legacy.sa@uatest-company.io', name: 'L', password: 'legacy-password-1', role: 'SUPER_ADMIN' } })).status === 403, 'the legacy create-with-password path also refuses a manager creating a SUPER_ADMIN (403)');
    ok((await call('POST', '/users', { token: mgrTok, body: { email: 'legacy.bu@uatest-company.io', name: 'L', password: 'legacy-password-1', role: 'BRANCH_USER', locationId: B3 } })).status === 400, '...and validates the branch (400)');
    ok((await call('POST', '/users', { token: mgrTok, body: { email: 'legacy.ok@uatest-company.io', name: 'L', password: 'legacy-password-1', role: 'DRIVER', requirePasswordChange: false } })).status === 403, '...and only a Super Admin may skip the forced change (403)');
    const legacyOk = await call('POST', '/users', { token: ownerTok, body: { email: 'Legacy.Mixed@UATest-Company.io', name: 'Legacy Made', password: 'legacy-password-1', role: 'DRIVER' } });
    ok(legacyOk.status === 201 && legacyOk.data.email === 'legacy.mixed@uatest-company.io' && legacyOk.data.passwordChangeRequired === true, 'the legacy path still works for a Super Admin: email normalised to lower-case, first-login change forced');
    for (const [label, tok] of [['a branch user', bu1.token], ['a driver', drv.token]] as const) {
      const r = await Promise.all([call('GET', '/users', { token: tok }), call('POST', '/users/invitations', { token: tok, body: { email: 'q@uatest-company.io', name: 'Q', role: 'DRIVER' } }), call('POST', `/users/${bu2.id}/deactivate`, { token: tok }), call('POST', `/locations/${B1}/assign-user/${bu2.id}`, { token: tok })]);
      ok(r.every((x) => x.status === 403), `${label} cannot use any user-management endpoint (403 on list, invite, deactivate, assign-user)`);
    }

    // ================= E. invitation tokens =================
    console.log('\n== E. expired, reused, revoked and invalid invitation tokens ==');
    const GOOD = secret('Walnut-Prairie-Ember-7025d');
    const generic = 'This invitation link is invalid or has expired';
    const mkInv = async (email: string, role = 'BRANCH_USER') => {
      const r = await invite(mgrTok, { email, name: email.split('@')[0], role, ...(role === 'BRANCH_USER' ? { locationId: B1 } : {}) });
      if (r.status !== 201) throw new Error('invite failed ' + r.raw);
      secret(r.data.invitation.code);
      return { id: r.data.user.id as string, code: r.data.invitation.code as string, email };
    };
    const msgs: string[] = [];
    const expiredI = await mkInv('expiring@uatest-company.io');
    await prisma.userInvitation.updateMany({ where: { userId: expiredI.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    const rExp = await accept(expiredI.code, GOOD);
    ok(rExp.status === 400 && rExp.data.message.startsWith(generic), 'EXPIRED invitation: refused (400)');
    msgs.push(JSON.stringify(rExp.data.message));
    ok((await call('GET', '/users', { token: ownerTok })).data.find((u: any) => u.id === expiredI.id).status === 'INVITE_EXPIRED', '...and listed as "invitation expired"');
    ok((await login(expiredI.email, GOOD)).status === 401, '...and the account still cannot sign in');
    const revI = await mkInv('revoked@uatest-company.io');
    const rvk = await call('POST', `/users/${revI.id}/invitation/revoke`, { token: mgrTok });
    ok(rvk.status === 201, 'a pending invitation can be revoked');
    ok(rvk.data.status === 'INVITE_REVOKED' && rvk.data.active === false, '...the account is marked revoked and inactive');
    const rRev = await accept(revI.code, GOOD);
    ok(rRev.status === 400 && rRev.data.message.startsWith(generic), 'REVOKED invitation: refused (400)');
    msgs.push(JSON.stringify(rRev.data.message));
    const rReuse = await accept(invM.data.invitation.code, GOOD);
    ok(rReuse.status === 400 && rReuse.data.message.startsWith(generic), 'REUSED invitation: refused (400)');
    msgs.push(JSON.stringify(rReuse.data.message));
    const bad = await Promise.all(['AAAAA-BBBBB-CCCCC-DDDDD', 'not-a-code', '', 'A'.repeat(64)].map((c) => accept(c, GOOD)));
    ok(bad.every((r) => r.status === 400), 'INVALID codes (well-formed but unknown, malformed, empty, oversized) are refused (400)');
    bad.slice(0, 2).forEach((r) => msgs.push(JSON.stringify(r.data.message)));
    ok(new Set(msgs).size === 1, 'expired, revoked, reused and unknown codes all return the identical message (nothing to enumerate)');
    const resI = await mkInv('resend@uatest-company.io');
    const rs = await call('POST', `/users/${revI.id}/invitation/resend`, { token: mgrTok });
    secret(rs.data?.invitation?.code ?? '');
    ok(rs.status === 201 && CODE_RE.test(rs.data.invitation.code) && rs.data.user.active === true && rs.data.user.status === 'INVITED', 'resending to a revoked invitee issues a fresh link and re-activates the account');
    ok((await accept(revI.code, GOOD)).status === 400, '...while the old (revoked) link stays dead');
    ok((await accept(rs.data.invitation.code, GOOD)).status === 200 && (await login(revI.email, GOOD)).status === 200, '...and the new link works once');
    const rs2 = await call('POST', `/users/${resI.id}/invitation/resend`, { token: mgrTok });
    secret(rs2.data.invitation.code);
    ok((await accept(resI.code, GOOD)).status === 400, 'RESEND voids the previous link');
    ok((await accept(rs2.data.invitation.code, GOOD)).status === 200, '...and the new one works');
    ok((await call('POST', `/users/${resI.id}/invitation/resend`, { token: mgrTok })).status === 409, 'resend for someone who already accepted is refused (409: use Reset password)');
    ok((await call('POST', `/users/${resI.id}/invitation/revoke`, { token: mgrTok })).status === 409, 'revoke for someone who already accepted is refused (409)');
    const race = await mkInv('race@uatest-company.io');
    const results = await Promise.all([1, 2, 3, 4, 5].map((n) => accept(race.code, secret(`Winner-Passphrase-Number-${n}x!`))));
    ok(results.filter((r) => r.status === 200).length === 1 && results.filter((r) => r.status === 400).length === 4, 'five simultaneous uses of one invitation: exactly ONE wins');
    const dpI = await mkInv('deactivated.pending@uatest-company.io');
    ok((await call('POST', `/users/${dpI.id}/deactivate`, { token: mgrTok })).status < 300, 'deactivating someone with a pending invitation...');
    ok((await accept(dpI.code, GOOD)).status === 400, '...kills their link');
    ok((await call('POST', `/users/${dpI.id}/reactivate`, { token: mgrTok })).status === 409, '...and plain reactivation is refused for someone who never accepted (409: send a new invitation)');
    ok((await call('POST', `/users/${dpI.id}/reset-password`, { token: mgrTok })).status === 409, '...and so is a password reset (409)');

    console.log('\n== E2. no account enumeration; email normalisation ==');
    const dup1 = await invite(mgrTok, { email: OWNER, name: 'Dup', role: 'DRIVER' });
    const dup2 = await invite(mgrTok, { email: 'branch1@uatest-company.io', name: 'Dup', role: 'DRIVER' });
    const dup3 = await invite(mgrTok, { email: 'BRANCH1@UATEST-COMPANY.IO', name: 'Dup', role: 'DRIVER' });
    ok(dup1.status === 409 && dup2.status === 409 && dup3.status === 409 && dup1.raw === dup2.raw && dup2.raw === dup3.raw, 'inviting an existing address (a Super Admin, a branch user, or a different letter case) gives the same 409 message: no case or role is revealed');
    const mixed = await onboard(mgrTok, 'Mixed.Case@UATest-Company.io', 'Mixed Case', 'DRIVER', 'Topaz-Riverbed-Lantern-1738n');
    ok((await dbUser('mixed.case@uatest-company.io')).id === mixed.id, 'an invited address is stored lower-case');
    ok((await login('MIXED.CASE@uatest-company.io', 'Topaz-Riverbed-Lantern-1738n')).status === 200, '...and signing in with different capitalisation works');

    // ================= F. deactivation + session revocation =================
    console.log('\n== F. deactivation, reactivation and session revocation ==');
    ok((await call('GET', '/requests', { token: bu1.token })).status === 200, 'precondition: the branch user\'s session works');
    const deact = await call('POST', `/users/${bu1.id}/deactivate`, { token: mgrTok });
    ok(deact.status < 300 && deact.data.status === 'DEACTIVATED' && deact.data.active === false, 'the manager deactivates the branch user');
    ok((await call('GET', '/requests', { token: bu1.token })).status === 401, '...their existing session stops working IMMEDIATELY (401)');
    ok((await login('branch1@uatest-company.io', BU1_PW)).status === 401, '...and they cannot sign in');
    ok((await call('POST', `/users/${bu1.id}/deactivate`, { token: mgrTok })).status < 300, 'deactivating an already-deactivated account is a harmless no-op');
    const react = await call('POST', `/users/${bu1.id}/reactivate`, { token: mgrTok });
    ok(react.status < 300 && react.data.status === 'ACTIVE', 'reactivate restores access');
    ok((await call('GET', '/requests', { token: bu1.token })).status === 401, '...but the OLD session is still dead (a new sign-in is required)');
    const bu1b = await login('branch1@uatest-company.io', BU1_PW);
    ok(bu1b.status === 200, '...and signing in again works');
    bu1.token = bu1b.data.accessToken;
    const drvTok2 = (await login('driver@uatest-company.io', 'Maple-Ferry-Granite-6607p')).data.accessToken as string;
    ok((await call('GET', '/transfers', { token: drvTok2 })).status === 200, 'precondition: driver session works');
    const so = await call('POST', `/users/${drv.id}/revoke-sessions`, { token: mgrTok });
    ok(so.status < 300, '"Sign out everywhere" succeeds for a manageable account');
    ok((await call('GET', '/transfers', { token: drvTok2 })).status === 401 && (await call('GET', '/transfers', { token: drv.token })).status === 401, '...all of that user\'s existing sessions are dead');
    const drvAgain = await login('driver@uatest-company.io', 'Maple-Ferry-Granite-6607p');
    ok(drvAgain.status === 200, '...while their password still works');
    drv.token = drvAgain.data.accessToken;
    ok((await call('POST', `/users/${mgrId}/revoke-sessions`, { token: ownerTok })).status < 300 && (await call('GET', '/users', { token: mgrTok })).status === 401, 'a Super Admin can also sign out a manager (their token dies)');
    ok((await login('mgr@uatest-company.io', MGR_PW)).status === 200, '...and the manager signs back in');
    ok((await call('POST', `/users/${ownerId}/deactivate`, { token: ownerTok })).status === 400, 'nobody can deactivate their own account (400)');

    // ================= G. last Super Admin =================
    console.log('\n== G. the system always keeps a working Super Admin ==');
    const ghost = { userId: 'ckghostsuperadmin00000000', email: 'ghost@uatest-company.io', name: 'Ghost Admin', role: 'SUPER_ADMIN', locationId: null };
    Object.assign(process.env, serverEnv);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NestFactory } = require('@nestjs/core');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require(`${API_DIR}/dist/app.module`);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { UsersService } = require(`${API_DIR}/dist/users/users.service`);
    const ctx = await NestFactory.createApplicationContext(AppModule, { logger: false });
    appCtx = ctx;
    const svc = ctx.get(UsersService);
    // owner + sa2 are usable Super Admins; take sa2 out so the owner is the only one
    ok((await call('POST', `/users/${sa2.id}/deactivate`, { token: ownerTok })).status < 300, 'a Super Admin deactivates the other Super Admin (allowed while another remains)');
    // Third Super Admin still only INVITED (cannot sign in) must NOT count as a usable admin
    const sa3Inv = await invite(ownerTok, { email: 'admin3@uatest-company.io', name: 'Pending Admin', role: 'SUPER_ADMIN' });
    secret(sa3Inv.data.invitation.code);
    let err: any;
    try { await svc.deactivate(ownerId, ghost); } catch (e) { err = e; }
    ok(err?.getStatus?.() === 409 && /last active Super Admin/i.test(err.message), 'deactivating the only usable Super Admin is refused (409), even though another Super Admin is merely invited');
    ok((await dbUser(OWNER)).active === true, '...and the account is untouched');
    ok((await call('GET', '/users', { token: ownerTok })).status === 200, '...and its session still works');
    ok((await call('POST', `/users/${sa2.id}/reactivate`, { token: ownerTok })).status < 300, 'the deactivated Super Admin can be reactivated');
    const sa2b = await login('admin2@uatest-company.io', 'Indigo-Harvest-Falcon-9120x');
    ok(sa2b.status === 200, '...and signs back in');
    // pending SA3 revoke / deactivate must be allowed (unusable admins are not protected)
    ok((await call('POST', `/users/${sa3Inv.data.user.id}/invitation/revoke`, { token: ownerTok })).status < 300, 'a pending (never-accepted) Super Admin invitation can be revoked freely');
    // race: the two usable admins try to deactivate each other simultaneously
    const [rA, rB] = await Promise.all([
      call('POST', `/users/${sa2.id}/deactivate`, { token: ownerTok }),
      call('POST', `/users/${ownerId}/deactivate`, { token: sa2b.data.accessToken }),
    ]);
    const activeSA = await prisma.user.count({ where: { role: 'SUPER_ADMIN', active: true } });
    ok([rA.status, rB.status].filter((s) => s < 300).length === 1 && activeSA >= 1, `two Super Admins deactivating each other at the same instant: exactly one succeeds (${rA.status}/${rB.status}), the system keeps ${activeSA} active`);
    // restore whichever was deactivated, using the survivor
    const survivor = (await dbUser(OWNER)).active ? { tok: ownerTok, other: sa2.id } : { tok: sa2b.data.accessToken as string, other: ownerId };
    ok((await call('POST', `/users/${survivor.other}/reactivate`, { token: survivor.tok })).status < 300, '...and the survivor can reactivate the other');
    // Either admin may have won the race; a reactivated account's old sessions are (correctly) dead, so sign in fresh.
    ownerTok = (await login(OWNER, OWNER_PW)).data.accessToken as string;
    ok((await call('POST', '/users', { token: ownerTok, body: { email: 'promote@uatest-company.io', name: 'P', password: 'legacy-password-1', role: 'SUPER_ADMIN' } })).status === 201, 'a Super Admin can create a Super Admin (legacy path), which a manager cannot');

    // ================= H. access boundaries =================
    console.log('\n== H. branch users and drivers stay inside their permissions ==');
    const cat = await call('POST', '/products', { token: ownerTok, body: { sku: 'UA-1', name: 'UA Test Product', category: 'General', unit: 'pcs', unitPrice: 1 } });
    const productId = cat.data.id as string;
    const bu1Fresh = (await login('branch1@uatest-company.io', BU1_PW)).data.accessToken as string;
    const r1 = await call('POST', '/requests', { token: bu1Fresh, body: { items: [{ productId, requestedQty: 3 }] } });
    const r2 = await call('POST', '/requests', { token: bu2.token, body: { items: [{ productId, requestedQty: 5 }] } });
    ok(r1.status === 201 && r2.status === 201, 'each branch user can create a request for their OWN branch');
    ok((await call('GET', `/requests/${r2.data.id}`, { token: bu1Fresh })).status === 403 && (await call('GET', `/requests/${r1.data.id}`, { token: bu2.token })).status === 403, 'a branch user is refused another branch\'s request by id (403: no IDOR)');
    const own = await call('GET', '/requests', { token: bu1Fresh });
    ok(own.data.length >= 1 && own.data.every((r: any) => r.branchId === B1), '...and their list contains only their own branch');
    const noAccess: [string, string, string, unknown?][] = [
      ['GET', '/inventory', 'inventory'], ['GET', '/activity', 'activity'], ['GET', '/supplier-invoices', 'supplier invoices'],
      ['POST', '/products', 'create product', { sku: 'X', name: 'X', category: 'X', unit: 'pcs' }], ['POST', '/locations', 'create location', { name: 'X', type: 'BRANCH' }],
      ['POST', '/inventory/adjustments', 'stock adjustments', { locationId: B1, productId, quantity: 5, reason: 'MANUAL_CORRECTION' }],
    ];
    for (const [label, tok] of [['branch user', bu1Fresh], ['driver', drv.token]] as const) {
      const rs = await Promise.all(noAccess.map(([m, p, , b]) => call(m, p, { token: tok, body: b })));
      ok(rs.every((r) => r.status === 403), `a ${label} is refused inventory, activity, invoices, product/location creation and stock adjustments (${rs.map((r) => r.status).join(',')})`);
    }
    const drvReq = await call('GET', '/requests', { token: drv.token });
    ok(drvReq.status === 200 && drvReq.data.length === 0 && (await call('GET', `/requests/${r1.data.id}`, { token: drv.token })).status === 403, 'a driver sees no stock requests and is refused one by id (403)');
    ok((await call('GET', '/transfers', { token: drv.token })).status === 200, '...but keeps access to the delivery (transfers) functionality');
    ok((await call('POST', `/requests/${r1.data.id}/approve`, { token: bu1Fresh })).status === 403, 'a branch user cannot approve requests (403)');

    // ================= I. audit + secrecy =================
    console.log('\n== I. audit events and secrecy ==');
    const queue = new Queue('activity', { connection: { host: '127.0.0.1', port: REDIS_PORT } });
    const jobs = await queue.getJobs(['waiting', 'active', 'delayed', 'completed', 'failed'], 0, 500);
    await queue.close();
    const audit = jobs.map((j) => ({ ...(j.data as { message: string; kind: string; userId?: string }) }));
    const has = (s: string) => audit.some((a) => a.message.includes(s) && a.kind === 'security');
    ok(has('invited Warehouse Lead as WAREHOUSE_MANAGER') && has('invited Branch One Staff as BRANCH_USER'), 'audit: invitations are recorded (security)');
    ok(has('accepted their invitation and set a password'), 'audit: acceptance is recorded');
    ok(has('sent a new invitation to') && has('revoked the invitation for'), 'audit: resend and revoke are recorded');
    ok(has('deactivated Branch One Staff; all of their sessions were ended') && has('reactivated Branch One Staff'), 'audit: deactivation (with session revocation) and reactivation are recorded');
    ok(has('signed Test Driver out of all devices') && has('moved Branch One Staff to a different branch'), 'audit: sign-out-everywhere and branch moves are recorded');
    ok(audit.filter((a) => a.message.includes('deactivated') || a.message.includes('invited ')).every((a) => !!a.userId), '...each attributed to the acting user');
    const blob = audit.map((a) => a.message).join('\n');
    ok(!secrets.filter(Boolean).some((s) => blob.includes(s) || blob.includes(s.replace(/-/g, ''))) && !ANY_CODE_RE.test(blob), 'no password and no invitation code appears in any audit entry');
    ok(serverLog.length > 0 && !secrets.filter(Boolean).some((s) => serverLog.includes(s)) && !ANY_CODE_RE.test(serverLog), 'and none appears in the server log (which is non-empty, so the check is meaningful)');
    const allUsers = await prisma.user.findMany({ select: { passwordHash: true } });
    ok(allUsers.every((u) => u.passwordHash.startsWith('$2')) && !secrets.some((s) => allUsers.some((u) => u.passwordHash.includes(s))), 'every stored credential is a bcrypt hash; no plaintext anywhere');
    ok((await prisma.userInvitation.count({ where: { tokenHash: { in: secrets.map((s) => s) } } })) === 0, 'and no invitation row holds a plaintext code');
  } catch (err) {
    crashed = true;
    console.error('CRASHED:', err);
  } finally {
    if (appCtx) await appCtx.close().catch(() => {});
    if (server) server.kill('SIGTERM');
    if (prisma) await prisma.$disconnect();
    await new Promise((r) => setTimeout(r, 500));
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`).catch(() => {});
    await admin.$disconnect();
    // Redis goes last: the in-process app context may still hold connections to it.
    console.log(`\n${crashed ? '❌ The test crashed.' : fail === 0 ? '✅ All checks passed.' : `❌ ${fail} check(s) failed.`} (${pass} passed, ${fail} failed)`);
    if (redisUp) spawnSync('docker', ['rm', '-f', REDIS_NAME]);
    process.exit(fail === 0 && !crashed ? 0 : 1);
  }
}

main().catch((err) => {
  console.error('CRASHED:', err);
  process.exit(1);
});
