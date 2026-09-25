/**
 * End-to-end tests for password change, forced first-login change, and the
 * admin-initiated reset (one-time code) flow, plus their authorization rules.
 *
 * Fully self-contained and disposable: creates a scratch Postgres database and a
 * scratch Redis container, applies the real migrations, creates the first admin
 * with the real bootstrap CLI, starts the COMPILED API (dist/) on a scratch port,
 * and drives the real HTTP endpoints. The database in DATABASE_URL is never written.
 *
 * Run with: npm run test:password-flows   (builds first; needs Docker and a Postgres role that can CREATE DATABASE)
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { Queue } from 'bullmq';
import { PrismaClient } from '@prisma/client';

const BASE_URL = process.env.DATABASE_URL;
if (!BASE_URL) throw new Error('DATABASE_URL is required (points at a Postgres that may CREATE DATABASE)');
const API_DIR = process.cwd();
const PORT = 3970 + Math.floor(Math.random() * 20);
const REDIS_PORT = 6390 + Math.floor(Math.random() * 9);
const REDIS_NAME = `durby-pwtest-redis-${process.pid}`;
const JWT_SECRET = 'pwtest-' + 'x'.repeat(48);
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

// Every secret the test ever uses, so we can prove none of them reaches server logs or audit jobs.
const secrets: string[] = [];
const secret = (s: string) => (secrets.push(s), s);

// --- HTTP: TRUST_PROXY=127.0.0.1, so a per-call X-Forwarded-For gives each logical client its own rate-limit bucket ---
let ipCounter = 10;
const freshIp = () => `198.51.100.${ipCounter++}`;
async function call(method: string, path: string, opts: { token?: string; body?: unknown; ip?: string } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': opts.ip ?? freshIp(),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try { data = text ? JSON.parse(text) : undefined; } catch { data = text; }
  return { status: res.status, data, headers: res.headers, raw: text };
}
const login = (email: string, password: string, ip?: string) => call('POST', '/auth/login', { body: { email, password }, ip });

function sh(cmd: string, args: string[], env: Record<string, string> = {}) {
  return spawnSync(cmd, args, { cwd: API_DIR, env: { ...process.env, ...env }, encoding: 'utf8' });
}
const urlFor = (db: string) => { const u = new URL(BASE_URL!); u.pathname = `/${db}`; return u.toString(); };

async function main() {
  const dbName = `pwflow_${Date.now()}`;
  const upgradeDb = `pwflow_upg_${Date.now()}`;
  const admin = new PrismaClient({ datasourceUrl: BASE_URL });
  let server: ChildProcess | undefined;
  let serverLog = '';
  let prisma: PrismaClient | undefined;
  let redisUp = false;

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

    const ADMIN_EMAIL = 'owner@pwtest-company.io';
    const ADMIN_PW = secret('Zebra-Quartz-Meadow-2026x');
    const boot = sh('npx', ['tsx', 'prisma/bootstrap-admin.ts'], { DATABASE_URL: dbUrl, ADMIN_EMAIL, ADMIN_NAME: 'Test Owner', ADMIN_PASSWORD: ADMIN_PW, BOOTSTRAP_CONFIRM_DB: dbName });
    if (boot.status !== 0) throw new Error('bootstrap failed: ' + boot.stdout + boot.stderr);

    server = spawn('node', ['dist/main.js'], {
      cwd: API_DIR,
      env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', DATABASE_URL: dbUrl, PORT: String(PORT), NODE_ENV: 'production', JWT_SECRET,
             REDIS_HOST: '127.0.0.1', REDIS_PORT: String(REDIS_PORT), REDIS_PASSWORD: '', CORS_ORIGIN: 'http://localhost', TRUST_PROXY: '127.0.0.1' },
    });
    server.stdout!.on('data', (d) => (serverLog += d));
    server.stderr!.on('data', (d) => (serverLog += d));
    for (let i = 0; i < 60; i++) { try { if ((await fetch(`${API}/health`)).ok) break; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 500)); }
    prisma = new PrismaClient({ datasourceUrl: dbUrl });

    // ---------------- setup through the real API ----------------
    const adminLogin = await login(ADMIN_EMAIL, ADMIN_PW);
    const adminTok: string = adminLogin.data.accessToken;
    ok(adminLogin.status === 200 && adminLogin.data.mustChangePassword === false, 'the bootstrap admin (chose their own password) is NOT forced to change it');
    ok((await call('GET', '/products', { token: adminTok })).status === 200, '...and can use the API immediately');
    await call('POST', '/locations', { token: adminTok, body: { name: 'PW Warehouse', type: 'WAREHOUSE' } });
    const br1 = (await call('POST', '/locations', { token: adminTok, body: { name: 'PW Branch 1', type: 'BRANCH' } })).data.id;
    const br2 = (await call('POST', '/locations', { token: adminTok, body: { name: 'PW Branch 2', type: 'BRANCH' } })).data.id;
    const INITIAL = secret('Initial-Temp-Pw-1234');
    const mk = async (email: string, role: string, locationId?: string, token = adminTok, extra: Record<string, unknown> = {}) =>
      call('POST', '/users', { token, body: { email, name: email.split('@')[0], password: INITIAL, role, ...(locationId ? { locationId } : {}), ...extra } });
    const created = {
      mgr1: await mk('mgr1@pwtest-company.io', 'WAREHOUSE_MANAGER'),
      mgr2: await mk('mgr2@pwtest-company.io', 'WAREHOUSE_MANAGER'),
      b1: await mk('branch1@pwtest-company.io', 'BRANCH_USER', br1),
      b2: await mk('b2@pwtest-company.io', 'BRANCH_USER', br2),
      drv: await mk('drv@pwtest-company.io', 'DRIVER'),
      adm2: await mk('adm2@pwtest-company.io', 'SUPER_ADMIN'),
    };
    const id = (k: keyof typeof created) => created[k].data.id as string;

    console.log('\n== A. forced first-login change ==');
    ok(created.b1.status === 201 && created.b1.data.passwordChangeRequired === true, 'POST /users creates the account flagged passwordChangeRequired by default');
    ok(!('passwordHash' in created.b1.data), '...and never returns a password hash');
    const l1 = await login('branch1@pwtest-company.io', INITIAL);
    ok(l1.status === 200 && l1.data.mustChangePassword === true, 'login tells the client a change is required');
    const t1: string = l1.data.accessToken;
    const blocked = await call('GET', '/products', { token: t1 });
    ok(blocked.status === 403 && blocked.data.code === 'PASSWORD_CHANGE_REQUIRED', 'every ordinary route is refused (403 PASSWORD_CHANGE_REQUIRED) until the password is changed, enforced server-side');
    ok((await call('GET', '/requests', { token: t1 })).status === 403, '...including a branch user\'s own data routes');
    const me1 = await call('GET', '/auth/me', { token: t1 });
    ok(me1.status === 200 && me1.data.passwordChangeRequired === true, 'GET /auth/me stays available and reports the flag');
    const wrongCur = await call('POST', '/auth/change-password', { token: t1, body: { currentPassword: 'not-my-password-123', newPassword: secret('Brand-New-Password-77!') } });
    ok(wrongCur.status === 400 && /current password is incorrect/i.test(JSON.stringify(wrongCur.data)), 'a wrong current password is a 400, NOT a 401 (a 401 would make the web app log the user out)');
    const weak = await call('POST', '/auth/change-password', { token: t1, body: { currentPassword: INITIAL, newPassword: 'short' } });
    ok(weak.status === 400 && Array.isArray(weak.data.message) && weak.data.message.length >= 1, 'a weak new password is rejected with the reasons');
    ok((await call('POST', '/auth/change-password', { token: t1, body: { currentPassword: INITIAL, newPassword: INITIAL } })).status === 400, 'the new password must differ from the current one');
    ok((await call('POST', '/auth/change-password', { token: t1, body: { currentPassword: INITIAL, newPassword: 'my-branch1-secret-99' } })).status === 400, 'a password containing the email name is rejected');
    ok((await call('POST', '/auth/change-password', { token: t1, body: { currentPassword: INITIAL, newPassword: 'ChangeMe123!' } })).status === 400, 'the public default password is rejected');
    ok((await call('POST', '/auth/change-password', { token: t1, body: { currentPassword: INITIAL, newPassword: 'x'.repeat(80) + 'aB3$' } })).status === 400, 'a password over bcrypt\'s 72-byte limit is refused, not silently truncated');
    const B1_NEW = secret('Brand-New-Password-77!');
    const changed = await call('POST', '/auth/change-password', { token: t1, body: { currentPassword: INITIAL, newPassword: B1_NEW } });
    ok(changed.status === 200 && !!changed.data.accessToken && changed.data.mustChangePassword === false, 'a valid change succeeds and returns a fresh session');
    ok((await call('GET', '/auth/me', { token: t1 })).status === 401, 'the OLD token is rejected immediately (session revoked)');
    const t1b: string = changed.data.accessToken;
    ok((await call('GET', '/requests', { token: t1b })).status === 200, 'the new token works and the block is gone');
    ok((await login('branch1@pwtest-company.io', INITIAL)).status === 401, 'the old password no longer logs in');
    const l1c = await login('branch1@pwtest-company.io', B1_NEW);
    ok(l1c.status === 200 && l1c.data.mustChangePassword === false, 'the new password logs in, no more change required');
    ok((await prisma.user.findUnique({ where: { id: id('b1') } }))?.passwordHash.startsWith('$2') === true, 'the new password is stored as a bcrypt hash');
    ok((await mk('skip@pwtest-company.io', 'DRIVER', undefined, adminTok, { requirePasswordChange: false })).data.passwordChangeRequired === false, 'a SUPER_ADMIN may create an account that skips the forced change');
    // mgr1 needs a working session for authorization tests below
    const activate = async (email: string, newPw: string) => {
      const l = await login(email, INITIAL);
      const c = await call('POST', '/auth/change-password', { token: l.data.accessToken, body: { currentPassword: INITIAL, newPassword: secret(newPw) } });
      return c.data.accessToken as string;
    };
    const mgr1Tok = await activate('mgr1@pwtest-company.io', 'Manager-One-Password-31!');
    ok((await mk('m-skip@pwtest-company.io', 'DRIVER', undefined, mgr1Tok, { requirePasswordChange: false })).status === 403, 'a WAREHOUSE_MANAGER may NOT create an account that skips the forced change');
    ok((await mk('m-ok@pwtest-company.io', 'DRIVER', undefined, mgr1Tok)).data.passwordChangeRequired === true, '...their new accounts default to forced change');

    console.log('\n== B. change-password ends other sessions ==');
    const s1 = (await login('b2@pwtest-company.io', INITIAL)).data.accessToken as string;
    const s2 = (await login('b2@pwtest-company.io', INITIAL)).data.accessToken as string;
    const B2_OWN = secret('Branch-Two-Own-Password-5!');
    const cb = await call('POST', '/auth/change-password', { token: s1, body: { currentPassword: INITIAL, newPassword: B2_OWN } });
    ok(cb.status === 200 && (await call('GET', '/auth/me', { token: s2 })).status === 401, 'changing the password on one device signs out every other device');
    ok((await call('GET', '/auth/me', { token: cb.data.accessToken })).status === 200, '...but not the device that made the change');
    const b2Tok = cb.data.accessToken as string;

    console.log('\n== C. admin-initiated reset (one-time code) ==');
    const vic = await login('drv@pwtest-company.io', INITIAL); const vicOldTok = vic.data.accessToken as string;
    const r1 = await call('POST', `/users/${id('drv')}/reset-password`, { token: mgr1Tok });
    const code1: string = r1.data.code; secret(code1); secret(code1.replace(/-/g, ''));
    ok(r1.status === 201 && /^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){3}$/.test(code1), 'a manager can start a reset for a driver: the response carries a 20-character one-time code');
    ok(r1.headers.get('cache-control') === 'no-store', 'the code response is marked Cache-Control: no-store');
    ok(Object.keys(r1.data).sort().join() === 'code,expiresAt,user' && !/password/i.test(Object.keys(r1.data.user).join()), 'the response contains only the code, its expiry and the user\'s identity: no password, no hash');
    const ttlMin = (new Date(r1.data.expiresAt).getTime() - Date.now()) / 60000;
    ok(ttlMin > 55 && ttlMin <= 60.5, `the code expires in about 60 minutes (${ttlMin.toFixed(1)})`);
    const row = await prisma.passwordResetToken.findFirst({ where: { userId: id('drv') } });
    ok(!!row && /^[0-9a-f]{64}$/.test(row.tokenHash) && !JSON.stringify(row).includes(code1.replace(/-/g, '')) && row.createdById !== '', 'the database stores only a SHA-256 hash, never the code');
    ok((await login('drv@pwtest-company.io', INITIAL)).status === 401, 'starting a reset IMMEDIATELY disables the old password');
    ok((await call('GET', '/auth/me', { token: vicOldTok })).status === 401, '...and ends the user\'s existing sessions');
    const bad = await call('POST', '/auth/reset-password', { body: { code: 'AAAAA-BBBBB-CCCCC-DDDDD', newPassword: secret('Driver-Chosen-Password-9!') } });
    const malformed = await call('POST', '/auth/reset-password', { body: { code: 'nope', newPassword: 'Driver-Chosen-Password-9!' } });
    ok(bad.status === 400 && malformed.status === 400 && JSON.stringify(bad.data) === JSON.stringify(malformed.data), 'a wrong code and a malformed code give the identical generic error');
    const weakReset = await call('POST', '/auth/reset-password', { body: { code: code1, newPassword: 'short' } });
    ok(weakReset.status === 400 && Array.isArray(weakReset.data.message), 'a weak new password is rejected with reasons');
    const DRV_PW = 'Driver-Chosen-Password-9!';
    const done = await call('POST', '/auth/reset-password', { body: { code: code1.toLowerCase().replace(/-/g, ' '), newPassword: DRV_PW } });
    ok(done.status === 200 && done.data.ok === true && !done.data.accessToken, 'the user sets their OWN password with the code (any case/spacing): no token is issued, they sign in normally');
    const dl = await login('drv@pwtest-company.io', DRV_PW);
    ok(dl.status === 200 && dl.data.mustChangePassword === false, 'they sign in with the password THEY chose, with no further forced change');
    ok((await call('GET', '/transfers', { token: dl.data.accessToken })).status === 200, '...and can use the app');
    const reuse = await call('POST', '/auth/reset-password', { body: { code: code1, newPassword: 'Another-Fresh-Password-1!' } });
    ok(reuse.status === 400 && JSON.stringify(reuse.data) === JSON.stringify(bad.data), 'the code is single-use (a second use gets the same generic error)');
    ok((await call('GET', '/auth/me', { token: code1 })).status === 401, 'a reset code is not a valid bearer token');
    const after = await prisma.user.findUnique({ where: { id: id('drv') } });
    ok(after?.role === 'DRIVER' && after.locationId === null && after.active === true, 'completing a reset changes only the password: role, branch and status are untouched');

    // expiry, supersession, concurrency, deactivation
    const r2 = await call('POST', `/users/${id('drv')}/reset-password`, { token: adminTok }); const code2: string = secret(r2.data.code);
    await prisma.passwordResetToken.updateMany({ where: { userId: id('drv'), usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await call('POST', '/auth/reset-password', { body: { code: code2, newPassword: 'Expired-Attempt-Password-1!' } });
    ok(expired.status === 400 && JSON.stringify(expired.data) === JSON.stringify(bad.data), 'an expired code gets the same generic error');
    const r3 = await call('POST', `/users/${id('drv')}/reset-password`, { token: adminTok }); const code3: string = secret(r3.data.code);
    const r4 = await call('POST', `/users/${id('drv')}/reset-password`, { token: adminTok }); const code4: string = secret(r4.data.code);
    ok((await call('POST', '/auth/reset-password', { body: { code: code3, newPassword: 'Superseded-Password-Attempt-1!' } })).status === 400, 'issuing a new code voids the previous one');
    const races = await Promise.all([1, 2, 3, 4, 5].map((n) => call('POST', '/auth/reset-password', { body: { code: code4, newPassword: secret(`Race-Winner-Password-${n}x!`) } })));
    ok(races.filter((r) => r.status === 200).length === 1 && races.filter((r) => r.status === 400).length === 4, 'five simultaneous uses of one code: exactly ONE wins');
    await call('PATCH', `/users/${id('drv')}`, { token: adminTok, body: { active: false } });
    const rd = await call('POST', `/users/${id('drv')}/reset-password`, { token: adminTok });
    ok(rd.status === 409, 'a deactivated account cannot be reset (409) until reactivated');
    await call('PATCH', `/users/${id('drv')}`, { token: adminTok, body: { active: true } });

    console.log('\n== D. authorization and privilege escalation ==');
    const before = async (email: string) => (await prisma!.user.findUnique({ where: { email } }))!.passwordHash;
    const mgr2Hash = await before('mgr2@pwtest-company.io'); const adminHash = await before(ADMIN_EMAIL);
    const dMgr = await call('POST', `/users/${id('mgr2')}/reset-password`, { token: mgr1Tok });
    ok(dMgr.status === 403, 'a WAREHOUSE_MANAGER cannot reset another manager (403)');
    const dAdm = await call('POST', `/users/${id('adm2')}/reset-password`, { token: mgr1Tok });
    ok(dAdm.status === 403, 'a WAREHOUSE_MANAGER cannot reset a SUPER_ADMIN (403)');
    const adminId = (await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } }))!.id;
    ok((await call('POST', `/users/${adminId}/reset-password`, { token: mgr1Tok })).status === 403, '...including the bootstrap admin');
    ok((await before('mgr2@pwtest-company.io')) === mgr2Hash && (await before(ADMIN_EMAIL)) === adminHash, 'and the refused attempts changed NOTHING (no password disabled, no code issued)');
    ok((await prisma.passwordResetToken.count({ where: { userId: { in: [id('mgr2'), id('adm2'), adminId] } } })) === 0, 'no reset code exists for the protected accounts');
    ok((await call('POST', `/users/${id('drv')}/reset-password`, { token: b2Tok })).status === 403, 'a BRANCH_USER cannot start a reset (403)');
    const drvTok = (await login('drv@pwtest-company.io', 'Race-Winner-Password-1x!')).data?.accessToken
      ?? (await login('drv@pwtest-company.io', 'Race-Winner-Password-2x!')).data?.accessToken
      ?? (await login('drv@pwtest-company.io', 'Race-Winner-Password-3x!')).data?.accessToken
      ?? (await login('drv@pwtest-company.io', 'Race-Winner-Password-4x!')).data?.accessToken
      ?? (await login('drv@pwtest-company.io', 'Race-Winner-Password-5x!')).data?.accessToken;
    if (drvTok) ok((await call('POST', `/users/${id('b1')}/reset-password`, { token: drvTok })).status === 403, 'a DRIVER cannot start a reset (403)');
    ok((await call('POST', `/users/${id('b1')}/reset-password`, { body: {} })).status === 401, 'an unauthenticated request is refused (401)');
    ok((await call('POST', `/users/${adminId}/reset-password`, { token: adminTok })).status === 400, 'nobody can use the admin reset on themselves (400)');
    ok((await call('POST', `/users/does-not-exist/reset-password`, { token: adminTok })).status === 404, 'an unknown user is 404');
    ok((await call('POST', `/users/${id('mgr2')}/reset-password`, { token: adminTok })).status === 201, 'a SUPER_ADMIN can reset a manager');
    // recovery path: one admin resets the other, who then sets their own password
    const rAdm = await call('POST', `/users/${id('adm2')}/reset-password`, { token: adminTok });
    ok(rAdm.status === 201, 'a SUPER_ADMIN can reset ANOTHER SUPER_ADMIN (the recovery path)');
    const ADM2_PW = secret('Recovery-Admin-Password-42!');
    await call('POST', '/auth/reset-password', { body: { code: secret(rAdm.data.code), newPassword: ADM2_PW } });
    const adm2 = await login('adm2@pwtest-company.io', ADM2_PW);
    ok(adm2.status === 200 && (await call('GET', '/users', { token: adm2.data.accessToken })).status === 200, '...and the recovered admin has full admin access again');
    // a code can only ever change ITS OWN account
    const bBefore = await before('b2@pwtest-company.io');
    const rB1 = await call('POST', `/users/${id('b1')}/reset-password`, { token: mgr1Tok }); await call('POST', '/auth/reset-password', { body: { code: secret(rB1.data.code), newPassword: secret('B1-Reset-Own-Password-8!') } });
    ok((await before('b2@pwtest-company.io')) === bBefore && (await login('b2@pwtest-company.io', B2_OWN)).status === 200, 'using one user\'s code leaves every other account\'s password untouched');
    ok((await mk('escalate@pwtest-company.io', 'SUPER_ADMIN', undefined, mgr1Tok)).status === 403, 'a manager still cannot create a SUPER_ADMIN (existing rule intact)');
    ok((await call('PATCH', `/users/${id('b1')}`, { token: adminTok, body: { password: 'Sneaky-Direct-Set-1234!' } })).status === 400, 'there is still no way to set a password through PATCH /users');

    console.log('\n== E. abuse controls and enumeration ==');
    const u1 = await login('nobody@pwtest-company.io', 'irrelevant-password-1'); const u2 = await login('b2@pwtest-company.io', 'irrelevant-password-2');
    ok(u1.status === 401 && u2.status === 401 && JSON.stringify(u1.data) === JSON.stringify(u2.data), 'unknown email and wrong password give the identical 401 body');
    const t0 = Date.now(); for (let i = 0; i < 3; i++) await login(`ghost${i}@pwtest-company.io`, 'x-irrelevant-password');
    ok((Date.now() - t0) / 3 >= 25, `an unknown email still costs a full bcrypt comparison (avg ${Math.round((Date.now() - t0) / 3)}ms), so response time doesn't reveal valid emails`);
    const sameIp = '203.0.113.99'; const stat: number[] = [];
    for (let i = 0; i < 6; i++) stat.push((await call('POST', '/auth/change-password', { token: b2Tok, body: { currentPassword: 'wrong-current-pw-123', newPassword: 'Whatever-New-Password-1!' }, ip: sameIp })).status);
    ok(stat.slice(0, 5).every((s) => s === 400) && stat[5] === 429, `change-password is limited to 5 attempts/minute per client (${stat.join(' ')})`);
    const stat2: number[] = [];
    for (let i = 0; i < 6; i++) stat2.push((await call('POST', '/auth/reset-password', { body: { code: 'AAAAA-BBBBB-CCCCC-DDDDD', newPassword: 'Whatever-New-Password-1!' }, ip: '203.0.113.98' })).status);
    ok(stat2.slice(0, 5).every((s) => s === 400) && stat2[5] === 429, `the public reset endpoint is limited to 5 attempts/minute per client (${stat2.join(' ')})`);

    console.log('\n== F. compatibility and hygiene ==');
    const legacy = jwt.sign({ sub: adminId }, JWT_SECRET, { expiresIn: '1h' }); // exactly what pre-feature tokens looked like: no `tv` claim
    ok((await call('GET', '/auth/me', { token: legacy })).status === 200, 'tokens issued BEFORE this feature (no version claim) stay valid until the first password change');
    const queue = new Queue('activity', { connection: { host: '127.0.0.1', port: REDIS_PORT } });
    const jobs = await queue.getJobs(['waiting', 'active', 'delayed', 'completed', 'failed'], 0, 200);
    const msgs = jobs.map((j) => JSON.stringify(j.data));
    await queue.close();
    ok(msgs.some((m) => m.includes('issued a password reset code for')) && msgs.some((m) => m.includes('completed a password reset')) && msgs.some((m) => m.includes('changed their password')), 'audit entries are recorded for reset issued, reset completed and password changed');
    ok(msgs.filter((m) => m.includes('issued a password reset code for')).every((m) => m.includes('"kind":"security"') && m.includes('"userId"')), '...attributed to the acting admin (who reset whom)');
    ok(!secrets.some((s) => msgs.join('\n').includes(s)) && !secrets.some((s) => serverLog.includes(s)), 'no password and no reset code appears in the audit entries or the server logs');
    ok(serverLog.length > 0 && !/password reset code[^\n]*[0-9A-Z]{5}-[0-9A-Z]{5}/.test(serverLog), 'the server log itself is non-empty (so the check above is meaningful) and holds no code');

    console.log('\n== G. upgrade path: the migration on a database that already has data ==');
    const PG_CONTAINER = process.env.PG_CONTAINER ?? 'durby-warehouse-postgres-1';
    const pgUser = decodeURIComponent(new URL(BASE_URL!).username);
    const psqlFile = (db: string, sql: string) => spawnSync('docker', ['exec', '-i', PG_CONTAINER, 'psql', '-U', pgUser, '-d', db, '-v', 'ON_ERROR_STOP=1', '-q'], { input: sql, encoding: 'utf8' });
    const migDirs = readdirSync('prisma/migrations', { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
    const newest = migDirs[migDirs.length - 1];
    ok(newest.includes('password_reset'), `the newest migration is the password one (${newest})`);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${upgradeDb}"`);
    let old = true;
    for (const d of migDirs.slice(0, -1)) old = old && psqlFile(upgradeDb, readFileSync(`prisma/migrations/${d}/migration.sql`, 'utf8')).status === 0;
    ok(old, 'all earlier migrations applied to a fresh database (the state production is in today)');
    const legacyHash = bcrypt.hashSync('Legacy-User-Password-1!', 10);
    const ins = psqlFile(upgradeDb, `INSERT INTO "User" (id, email, "passwordHash", name, role, "updatedAt") VALUES ('legacy1', 'legacy@pwtest-company.io', '${legacyHash}', 'Legacy User', 'WAREHOUSE_MANAGER', now());`);
    ok(ins.status === 0, 'a pre-existing user row (created before this feature) was inserted');
    const applied = psqlFile(upgradeDb, readFileSync(`prisma/migrations/${newest}/migration.sql`, 'utf8'));
    ok(applied.status === 0, 'the new migration applies cleanly on top of existing data');
    const upg = new PrismaClient({ datasourceUrl: urlFor(upgradeDb) });
    const legacyRow = await upg.user.findUnique({ where: { id: 'legacy1' } });
    ok(legacyRow?.passwordChangeRequired === false && legacyRow?.tokenVersion === 0, 'existing users get passwordChangeRequired=false and tokenVersion=0: nobody is suddenly forced to change or logged out');
    ok(legacyRow?.passwordHash === legacyHash && bcrypt.compareSync('Legacy-User-Password-1!', legacyRow!.passwordHash), '...and their password hash is untouched, so their current password still works');
    ok((await upg.passwordResetToken.count()) === 0, 'the new reset-token table exists and is empty');
    await upg.$disconnect();
    const drift = sh('npx', ['prisma', 'migrate', 'diff', '--from-url', urlFor(upgradeDb), '--to-schema-datamodel', 'prisma/schema.prisma', '--exit-code'], { DATABASE_URL: urlFor(upgradeDb) });
    ok(drift.status === 0, 'the migrated database matches schema.prisma exactly (no drift)');
  } finally {
    if (server) server.kill('SIGTERM');
    if (prisma) await prisma.$disconnect();
    if (redisUp) spawnSync('docker', ['rm', '-f', REDIS_NAME]);
    await new Promise((r) => setTimeout(r, 500));
    for (const d of [dbName, upgradeDb]) await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${d}" WITH (FORCE)`).catch(() => {});
    await admin.$disconnect();
  }

  console.log(`\n${fail === 0 ? '✅ All checks passed.' : `❌ ${fail} check(s) failed.`} (${pass} passed, ${fail} failed)`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('CRASHED:', err);
  process.exit(1);
});
