/**
 * Tests the break-glass command (prisma/reset-admin-password.ts) end to end.
 *
 * Disposable and self-contained: creates a scratch Postgres database and scratch Redis
 * container, applies the real migrations, starts the COMPILED API on a scratch port, and
 * runs the REAL command as a child process attached to a pseudo-terminal (so the hidden
 * prompt genuinely runs in raw mode). The database in DATABASE_URL is never written to.
 *
 * Run with: npm run test:reset-admin-password   (builds first; needs Docker, python3, and a
 * Postgres role that can CREATE DATABASE)
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const BASE_URL = process.env.DATABASE_URL;
if (!BASE_URL) throw new Error('DATABASE_URL is required (points at a Postgres that may CREATE DATABASE)');
const API_DIR = process.cwd();
const PORT = 3990 + Math.floor(Math.random() * 9);
const REDIS_PORT = 6400 + Math.floor(Math.random() * 9);
const REDIS_NAME = `durby-breakglass-redis-${process.pid}`;
const JWT_SECRET = 'bgtest-' + 'x'.repeat(48);
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

const urlFor = (db: string) => {
  const u = new URL(BASE_URL!);
  u.pathname = `/${db}`;
  return u.toString();
};
function sh(cmd: string, args: string[], env: Record<string, string> = {}) {
  return spawnSync(cmd, args, { cwd: API_DIR, env: { ...process.env, ...env }, encoding: 'utf8', input: '' });
}

// --- HTTP (TRUST_PROXY=127.0.0.1, so each call can claim its own client IP and not trip the login throttle) ---
let ipCounter = 10;
async function call(method: string, path: string, opts: { token?: string; body?: unknown } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `198.51.100.${ipCounter++}`, ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try { data = text ? JSON.parse(text) : undefined; } catch { data = text; }
  return { status: res.status, data, raw: text };
}
const login = (email: string, password: string) => call('POST', '/auth/login', { body: { email, password } });

// --- pty driver: runs a command on a real pseudo-terminal, answering prompts in order ---
const PTY_DRIVER = `
import json, os, pty, select, sys, time
spec = json.load(open(sys.argv[1]))
pid, fd = pty.fork()
if pid == 0:
    env = dict(spec["env"])
    os.execvpe(spec["cmd"][0], spec["cmd"], env)
out = b""
deadline = time.time() + spec.get("timeout", 60)
def pump(t=0.2):
    global out
    r, _, _ = select.select([fd], [], [], t)
    if r:
        try:
            d = os.read(fd, 65536)
        except OSError:
            return False
        if not d:
            return False
        out += d
    return True
alive = True
for step in spec["steps"]:
    want = step["expect"].encode()
    while want not in out and alive and time.time() < deadline:
        alive = pump()
    if want not in out:
        break
    if step.get("pause_marker"):
        open(step["pause_marker"], "w").write("x")
        while not os.path.exists(step["pause_go"]) and time.time() < deadline:
            time.sleep(0.05)
    time.sleep(0.15)
    if step["send"] == "\\x03":
        os.write(fd, b"\\x03")
    else:
        os.write(fd, step["send"].encode() + b"\\r")
    # mask the matched prompt so an identical prompt later is matched in order
    idx = out.find(want)
    out = out[:idx] + b"\\x01" * len(want) + out[idx + len(want):]
while alive and time.time() < deadline:
    alive = pump(0.3)
status = None
try:
    # the pty closing does not mean the child has been reaped yet: give it a moment before deciding it hung
    end = time.time() + 5
    while True:
        p, st = os.waitpid(pid, os.WNOHANG)
        if p != 0:
            status = os.waitstatus_to_exitcode(st)
            break
        if time.time() > end:
            os.kill(pid, 9)
            os.waitpid(pid, 0)
            status = -9
            break
        time.sleep(0.05)
except ChildProcessError:
    status = -1
print(json.dumps({"status": status, "out": out.decode("utf8", "replace")}))
`;
const workDir = mkdtempSync(join(tmpdir(), 'breakglass-'));
writeFileSync(join(workDir, 'driver.py'), PTY_DRIVER);
let specCounter = 0;
type Step = { expect: string; send: string; pause_marker?: string; pause_go?: string };
function runPty(cmd: string[], env: Record<string, string>, steps: Step[], timeout = 60): Promise<{ status: number | null; out: string }> {
  const specPath = join(workDir, `spec${specCounter++}.json`);
  writeFileSync(specPath, JSON.stringify({ cmd, env, steps, timeout }));
  return new Promise((resolve) => {
    const c = spawn('python3', [join(workDir, 'driver.py'), specPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    let o = '';
    c.stdout.on('data', (d) => (o += d));
    c.on('close', () => {
      try {
        const j = JSON.parse(o.trim().split('\n').pop()!);
        resolve({ status: j.status, out: j.out.replace(/\x01/g, '') });
      } catch {
        resolve({ status: null, out: o });
      }
    });
  });
}

const CLI = ['npx', 'tsx', 'prisma/reset-admin-password.ts'];
const DB_PROMPT = 'confirm this is the right environment';
const EMAIL_PROMPT = 'confirm this is the right person';
const PW1 = 'New password for';
const PW2 = 'Repeat new password';

async function main() {
  const dbName = `breakglass_${Date.now()}`;
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

    const OWNER = 'owner@bgtest-company.io';
    const OWNER_PW = 'Zebra-Quartz-Meadow-2026x';
    const boot = sh('npx', ['tsx', 'prisma/bootstrap-admin.ts'], { DATABASE_URL: dbUrl, ADMIN_EMAIL: OWNER, ADMIN_NAME: 'Test Owner', ADMIN_PASSWORD: OWNER_PW, BOOTSTRAP_CONFIRM_DB: dbName });
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

    // ---------------- fixtures through the real API ----------------
    const ownerLogin = await login(OWNER, OWNER_PW);
    const ownerTok: string = ownerLogin.data.accessToken;
    const INITIAL = 'Initial-Temp-Pw-1234';
    const br = (await call('POST', '/locations', { token: ownerTok, body: { name: 'BG Branch', type: 'BRANCH' } })).data.id;
    const mk = (email: string, role: string, extra: Record<string, unknown> = {}) =>
      call('POST', '/users', { token: ownerTok, body: { email, name: email.split('@')[0], password: INITIAL, role, requirePasswordChange: false, ...extra } });
    const adm2 = await mk('second.admin@bgtest-company.io', 'SUPER_ADMIN');
    const mgr = await mk('mgr@bgtest-company.io', 'WAREHOUSE_MANAGER');
    const drv = await mk('drv@bgtest-company.io', 'DRIVER');
    const brU = await mk('branch@bgtest-company.io', 'BRANCH_USER', { locationId: br });
    const inactive = await mk('retired.admin@bgtest-company.io', 'SUPER_ADMIN');
    ok([adm2, mgr, drv, brU, inactive].every((r) => r.status === 201), 'fixtures created through the API (second admin, manager, driver, branch user, one more admin)');
    await prisma.user.update({ where: { id: inactive.data.id }, data: { active: false } });

    const snapshot = async () => (await prisma!.user.findMany({ orderBy: { email: 'asc' } })).map((u) => JSON.stringify(u));
    const audit = () => prisma!.activityLog.findMany({ where: { message: { startsWith: 'Break-glass' } } });
    const env = (target: string | undefined, extra: Record<string, string> = {}) => ({
      PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', DATABASE_URL: dbUrl, NODE_ENV: 'production', ...(target !== undefined ? { TARGET_EMAIL: target } : {}), ...extra,
    });
    const good = 'Correct-Horse-Battery-Staple-9';
    const fullRun = (target: string, pw = good) => [
      { expect: DB_PROMPT, send: dbName }, { expect: EMAIL_PROMPT, send: target }, { expect: PW1, send: pw }, { expect: PW2, send: pw },
    ];

    // ================= refusals before anything is touched =================
    console.log('\n== A. usage and environment refusals (nothing touched) ==');
    let before = await snapshot();
    let r = await runPty([...CLI, 'Hunter2-Sup3rSecret-pw'], env(OWNER), []);
    ok(r.status === 2 && /takes no arguments/.test(r.out), 'any command-line argument is refused (exit 2)');
    ok(!r.out.includes('Hunter2-Sup3rSecret-pw'), '...and a password-looking argument is never echoed back');
    r = await runPty(['npm', 'run', '--silent', 'reset:admin-password', '--', 'Hunter2-Sup3rSecret-pw'], env(OWNER), []);
    ok(r.status === 2 && !r.out.includes('Hunter2-Sup3rSecret-pw'), 'also refused when passed through `npm run ... --`');
    const noTty = spawnSync('npx', ['tsx', 'prisma/reset-admin-password.ts'], { cwd: API_DIR, env: env(OWNER), encoding: 'utf8', input: `${dbName}\n${OWNER}\n${good}\n${good}\n` });
    ok(noTty.status === 2 && /interactive terminal/.test(noTty.stderr), 'no terminal (piped stdin) is refused, so the password cannot be scripted or piped in');
    r = await runPty(CLI, env(undefined), []);
    ok(r.status === 2 && /TARGET_EMAIL/.test(r.out), 'missing TARGET_EMAIL is refused (exit 2)');
    r = await runPty(CLI, env('Owner@BGtest-company.io'), []);
    ok(r.status === 2 && /lowercase/.test(r.out), 'non-lowercase TARGET_EMAIL is refused');
    r = await runPty(CLI, env('not-an-email'), []);
    ok(r.status === 2, 'malformed TARGET_EMAIL is refused');
    r = await runPty(CLI, { ...env(OWNER), DATABASE_URL: '' }, []);
    ok(r.status === 2 && /DATABASE_URL/.test(r.out), 'missing DATABASE_URL is refused');
    ok(JSON.stringify(before) === JSON.stringify(await snapshot()), 'database identical after every refusal above');

    // ================= target refusals =================
    console.log('\n== B. target must be an existing, active SUPER_ADMIN ==');
    const refusals: [string, string, RegExp][] = [
      ['nobody@bgtest-company.io', 'a missing user', /No account with the email/],
      ['mgr@bgtest-company.io', 'a WAREHOUSE_MANAGER', /not a SUPER_ADMIN.*WAREHOUSE_MANAGER/],
      ['drv@bgtest-company.io', 'a DRIVER', /not a SUPER_ADMIN.*DRIVER/],
      ['branch@bgtest-company.io', 'a BRANCH_USER', /not a SUPER_ADMIN.*BRANCH_USER/],
      ['retired.admin@bgtest-company.io', 'a deactivated SUPER_ADMIN', /deactivated/],
    ];
    for (const [email, label, re] of refusals) {
      r = await runPty(CLI, env(email), [{ expect: 'never reached', send: 'x' }], 8);
      ok(r.status === 3 && re.test(r.out) && !r.out.includes(DB_PROMPT), `${label} is refused with exit 3 before any confirmation prompt`);
    }
    ok(JSON.stringify(before) === JSON.stringify(await snapshot()), 'no user created, no role changed, nobody reactivated, no hash touched');
    ok((await audit()).length === 0, 'no audit entry for refused attempts');

    // ================= confirmations =================
    console.log('\n== C. deliberate confirmation ==');
    r = await runPty(CLI, env(OWNER), [{ expect: DB_PROMPT, send: 'mydb' }]);
    ok(r.status === 1 && /Confirmation did not match/.test(r.out) && !r.out.includes(PW1), 'wrong database name aborts before the password is even asked');
    ok(r.out.includes(dbName) && /NODE_ENV=production/.test(r.out), '...and the operator was shown the database name and NODE_ENV');
    r = await runPty(CLI, env(OWNER), [{ expect: DB_PROMPT, send: dbName }, { expect: EMAIL_PROMPT, send: 'wrong@bgtest-company.io' }]);
    ok(r.status === 1 && /Confirmation did not match/.test(r.out) && !r.out.includes(PW1), 'wrong email confirmation aborts');
    r = await runPty(CLI, env(OWNER), [{ expect: DB_PROMPT, send: '' }]);
    ok(r.status === 1, 'empty confirmation aborts');
    r = await runPty(CLI, env(OWNER), [{ expect: DB_PROMPT, send: '\x03' }], 20);
    ok(r.status === 130, 'Ctrl-C at a visible prompt exits 130 promptly');
    r = await runPty(CLI, env(OWNER), [{ expect: DB_PROMPT, send: dbName }, { expect: EMAIL_PROMPT, send: OWNER }, { expect: PW1, send: '\x03' }], 20);
    ok(r.status === 130 && /Cancelled/.test(r.out), 'Ctrl-C at the hidden password prompt exits 130 (Cancelled)');
    ok(JSON.stringify(before) === JSON.stringify(await snapshot()) && (await audit()).length === 0, 'nothing changed by any aborted confirmation');

    // ================= password policy =================
    console.log('\n== D. new password must satisfy the existing policy ==');
    const invalid: [string, string, string, RegExp][] = [
      ['too short', 'Short1!', 'Short1!', /at least 12/],
      ['contains the email name', 'owner-Password-2026-zz', 'owner-Password-2026-zz', /email name/],
      ['a known default', 'changeme123!', 'changeme123!', /known default/],
      ['too repetitive', 'aaaaaaaaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaaaaaa', /repetitive/],
      ['over 72 bytes', 'Xy9!' + 'q'.repeat(80), 'Xy9!' + 'q'.repeat(80), /at most 72/],
      ['mismatched confirmation', 'Correct-Horse-Battery-Staple-9', 'Correct-Horse-Battery-Staple-8', /did not match/],
    ];
    for (const [label, a, b, re] of invalid) {
      // one bad attempt, then Ctrl-C at the retry prompt so we look at exactly that rejection
      r = await runPty(CLI, env(OWNER), [
        { expect: DB_PROMPT, send: dbName }, { expect: EMAIL_PROMPT, send: OWNER }, { expect: PW1, send: a }, { expect: PW2, send: b }, { expect: PW1, send: '\x03' },
      ], 30);
      ok(re.test(r.out) && !r.out.includes('Done.'), `rejected: ${label}`);
    }
    // three bad attempts in a row -> abort, nothing changed
    r = await runPty(CLI, env(OWNER), [
      { expect: DB_PROMPT, send: dbName }, { expect: EMAIL_PROMPT, send: OWNER },
      { expect: PW1, send: 'short' }, { expect: PW2, send: 'short' },
      { expect: PW1, send: 'short' }, { expect: PW2, send: 'short' },
      { expect: PW1, send: 'short' }, { expect: PW2, send: 'short' },
    ]);
    ok(r.status === 1 && /Too many invalid attempts/.test(r.out), 'three invalid attempts abort the run (exit 1)');
    ok(JSON.stringify(before) === JSON.stringify(await snapshot()) && (await audit()).length === 0, 'nothing changed by any rejected password');

    // ================= success + session revocation =================
    console.log('\n== E. success: password replaced, sessions revoked, nothing else touched ==');
    const oldSession = (await login(OWNER, OWNER_PW)).data.accessToken as string;
    const adm2Session = (await login('second.admin@bgtest-company.io', INITIAL)).data.accessToken as string;
    ok((await call('GET', '/products', { token: oldSession })).status === 200, 'precondition: the owner\'s existing session works');
    // stale reset code + forced-change flag that the recovery should clear
    await prisma.user.update({ where: { id: ownerLogin.data.user.id }, data: { passwordChangeRequired: true } });
    await prisma.passwordResetToken.create({ data: { userId: ownerLogin.data.user.id, tokenHash: 'a'.repeat(64), expiresAt: new Date(Date.now() + 3_600_000), createdById: adm2.data.id } });
    const ownerBefore = await prisma.user.findUniqueOrThrow({ where: { email: OWNER } });
    const othersBefore = (await prisma.user.findMany({ where: { email: { not: OWNER } }, orderBy: { email: 'asc' } })).map((u) => JSON.stringify(u));
    const userCountBefore = await prisma.user.count();

    r = await runPty(['npm', 'run', '--silent', 'reset:admin-password'], env(OWNER, { ADMIN_PASSWORD: 'Env-Var-Password-Should-Be-Ignored-1', NEW_PASSWORD: 'Env-Var-Password-Should-Be-Ignored-1' }), fullRun(OWNER));
    ok(r.status === 0 && /Done\./.test(r.out), 'exits 0 through `npm run reset:admin-password`');
    ok(!r.out.includes(good), 'the typed password never appears on the terminal (hidden prompt, no echo)');
    ok(!/\$2[aby]\$/.test(r.out), '...and no hash is printed either');
    const ownerAfter = await prisma.user.findUniqueOrThrow({ where: { email: OWNER } });
    ok(await bcrypt.compare(good, ownerAfter.passwordHash), 'the stored hash verifies against the typed password');
    ok(ownerAfter.passwordHash.startsWith('$2') && /^\$2[aby]\$10\$/.test(ownerAfter.passwordHash), '...and uses the app\'s bcrypt settings (cost 10)');
    ok(!(await bcrypt.compare(OWNER_PW, ownerAfter.passwordHash)), 'the old password no longer matches');
    ok(!(await bcrypt.compare('Env-Var-Password-Should-Be-Ignored-1', ownerAfter.passwordHash)), 'passwords in the environment are ignored');
    ok(ownerAfter.tokenVersion === ownerBefore.tokenVersion + 1, 'tokenVersion incremented by exactly 1');
    ok(ownerAfter.passwordChangeRequired === false, 'the forced-change flag is cleared (the operator chose this password)');
    ok(ownerAfter.role === ownerBefore.role && ownerAfter.active && ownerAfter.email === ownerBefore.email && ownerAfter.name === ownerBefore.name && ownerAfter.locationId === ownerBefore.locationId, 'role, active, email, name and location unchanged');
    ok((await prisma.passwordResetToken.count({ where: { userId: ownerBefore.id, usedAt: null } })) === 0, 'unused reset codes for the account were discarded');
    ok(JSON.stringify((await prisma.user.findMany({ where: { email: { not: OWNER } }, orderBy: { email: 'asc' } })).map((u) => JSON.stringify(u))) === JSON.stringify(othersBefore), 'every OTHER account is byte-for-byte unchanged');
    ok((await prisma.user.count()) === userCountBefore, 'no user was created');
    const rows = await audit();
    ok(rows.length === 1 && rows[0].kind === 'security' && rows[0].message.includes(OWNER) && /server console/.test(rows[0].message), 'exactly one audit entry (kind security) naming the account and the console origin');
    ok(!rows[0].message.includes(good) && !/\$2[aby]\$/.test(rows[0].message) && /run by \S+@\S+/.test(rows[0].message), '...containing no password or hash, and recording the operating-system operator');

    ok((await call('GET', '/products', { token: oldSession })).status === 401, 'session revocation: the owner\'s pre-existing token is now rejected (401)');
    ok((await login(OWNER, OWNER_PW)).status === 401, 'the old password no longer logs in');
    const fresh = await login(OWNER, good);
    ok(fresh.status === 200 && fresh.data.mustChangePassword === false, 'the new password logs in and does not force another change');
    ok((await call('GET', '/products', { token: fresh.data.accessToken })).status === 200, '...and the fresh session works');
    ok((await call('GET', '/products', { token: adm2Session })).status === 200, 'another administrator\'s session is unaffected');

    // ================= atomicity =================
    console.log('\n== F. atomic: a failure part-way changes nothing ==');
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION bg_fail() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'simulated audit failure'; END; $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER bg_fail_trg BEFORE INSERT ON "ActivityLog" FOR EACH ROW WHEN (NEW.message LIKE 'Break-glass%') EXECUTE FUNCTION bg_fail()`);
    const atomBefore = await prisma.user.findUniqueOrThrow({ where: { email: OWNER } });
    const auditBefore = (await audit()).length;
    const newer = 'Another-Valid-Passphrase-42';
    r = await runPty(CLI, env(OWNER), fullRun(OWNER, newer));
    const atomAfter = await prisma.user.findUniqueOrThrow({ where: { email: OWNER } });
    ok(r.status === 1 && /nothing was changed/i.test(r.out) && !/Done\./.test(r.out), 'audit-write failure => exit 1 and "nothing was changed"');
    ok(atomAfter.passwordHash === atomBefore.passwordHash && atomAfter.tokenVersion === atomBefore.tokenVersion, 'password hash and tokenVersion rolled back with it');
    ok((await audit()).length === auditBefore, 'no partial audit row');
    ok((await login(OWNER, good)).status === 200, 'the previous password still works');
    await prisma.$executeRawUnsafe(`DROP TRIGGER bg_fail_trg ON "ActivityLog"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION bg_fail()`);

    // database unreachable
    r = await runPty(CLI, { ...env(OWNER), DATABASE_URL: `postgresql://x:y@127.0.0.1:1/${dbName}` }, [{ expect: 'never reached', send: 'x' }], 20);
    ok(r.status === 1 && !r.out.includes('x:y@'), 'unreachable database fails safely, without printing the connection string');
    r = await runPty(CLI, { ...env(OWNER), DATABASE_URL: urlFor(`nonexistent_${Date.now()}`) }, [{ expect: 'never reached', send: 'x' }], 20);
    ok(r.status !== 0, 'a database that does not exist fails safely');

    // ================= TOCTOU =================
    console.log('\n== G. the account is re-verified under a row lock at write time ==');
    const marker = join(workDir, 'paused');
    const go = join(workDir, 'go');
    const racing = runPty(CLI, env('second.admin@bgtest-company.io'), [
      { expect: DB_PROMPT, send: dbName }, { expect: EMAIL_PROMPT, send: 'second.admin@bgtest-company.io' }, { expect: PW1, send: good },
      { expect: PW2, send: good, pause_marker: marker, pause_go: go },
    ], 40);
    for (let i = 0; i < 100 && !existsSync(marker); i++) await new Promise((res) => setTimeout(res, 100));
    await prisma.user.update({ where: { id: adm2.data.id }, data: { role: 'DRIVER' } }); // demoted while the operator was typing
    writeFileSync(go, 'go');
    r = await racing;
    const adm2After = await prisma.user.findUniqueOrThrow({ where: { id: adm2.data.id } });
    ok(r.status === 3 && /changed while you were confirming/.test(r.out), 'demoted during the prompt => refused (exit 3)');
    ok(!(await bcrypt.compare(good, adm2After.passwordHash)) && adm2After.tokenVersion === 0 && adm2After.role === 'DRIVER', '...and the account was left exactly as it was found');
    await prisma.user.update({ where: { id: adm2.data.id }, data: { role: 'SUPER_ADMIN' } });

    // ================= no public endpoint, no leaks =================
    console.log('\n== H. no network surface, no leaks ==');
    for (const p of ['/auth/break-glass', '/auth/reset-admin-password', '/admin/reset-password', '/auth/recover']) {
      ok([401, 403, 404].includes((await call('POST', p, { body: { email: OWNER, password: good } })).status), `POST ${p} is not a working endpoint`);
    }
    const srcHits = spawnSync('grep', ['-rniE', 'break-?glass|reset-admin-password|reset:admin-password', 'src'], { cwd: API_DIR, encoding: 'utf8' }).stdout.trim();
    ok(srcHits === '', 'nothing in src/ (the HTTP application) references the recovery command');
    const distFiles = readdirSync(join(API_DIR, 'dist'), { recursive: true }).map(String);
    ok(!distFiles.some((f) => /break|reset-admin/i.test(f)), 'nothing in the compiled application mentions it either');
    const everything = serverLog + JSON.stringify(await prisma.activityLog.findMany());
    ok(![good, newer, OWNER_PW].some((s) => everything.includes(s)), 'no password appears in server logs or any audit row');
    const scriptSrc = readFileSync(join(API_DIR, 'prisma/reset-admin-password.ts'), 'utf8');
    ok(!/process\.env\.(ADMIN|NEW|PASSWORD|TARGET_PASSWORD)/.test(scriptSrc), 'the command never reads a password from the environment');
  } finally {
    if (server) server.kill('SIGTERM');
    if (prisma) await prisma.$disconnect();
    if (redisUp) spawnSync('docker', ['rm', '-f', REDIS_NAME]);
    await new Promise((r) => setTimeout(r, 500));
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`).catch(() => {});
    await admin.$disconnect();
  }

  console.log(`\n${fail === 0 ? '✅ All checks passed.' : `❌ ${fail} check(s) failed.`} (${pass} passed, ${fail} failed)`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('CRASHED:', err);
  process.exit(1);
});
