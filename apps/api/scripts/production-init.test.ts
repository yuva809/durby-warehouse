/**
 * Tests the production-initialization path: the seed's fail-closed guards
 * and the one-time first-administrator bootstrap (prisma/bootstrap-admin.ts).
 * Runs the REAL commands as child processes against throwaway databases it
 * creates on the same Postgres server (and drops afterwards) — the database
 * named in DATABASE_URL is never written to.
 *
 * Run with: npm run test:production-init
 * (DATABASE_URL must point at a Postgres whose role may CREATE DATABASE, e.g. the local compose stack)
 */
import { spawn, spawnSync } from 'node:child_process';
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { validateIdentity, validatePassword } from '../prisma/bootstrap-admin';

const API_DIR = process.cwd();
const BASE_URL = process.env.DATABASE_URL;
if (!BASE_URL) throw new Error('DATABASE_URL is required');

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

const STRONG = 'Tr0ub4dor&3-northwind-Zx9';
const ADMIN_EMAIL = 'owner@client-company.example';

const admin = new PrismaClient({ datasourceUrl: BASE_URL });
const created: string[] = [];
let counter = 0;

function urlFor(db: string) {
  const u = new URL(BASE_URL!);
  u.pathname = `/${db}`;
  return u.toString();
}
async function newDb(migrate: boolean) {
  const name = `init_test_${Date.now()}_${counter++}`;
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  created.push(name);
  const url = urlFor(name);
  if (migrate) {
    const r = spawnSync('npx', ['prisma', 'migrate', 'deploy'], { cwd: API_DIR, env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`migrate deploy failed for ${name}: ${r.stderr}`);
  }
  return { name, url, prisma: new PrismaClient({ datasourceUrl: url }) };
}

function cleanEnv(extra: Record<string, string>) {
  // Deliberately NOT inheriting the caller's env wholesale: no stray ADMIN_*/SEED_* values leak in.
  return { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...extra };
}
function run(script: string, env: Record<string, string>) {
  const r = spawnSync('npx', ['tsx', script], { cwd: API_DIR, env: cleanEnv(env), encoding: 'utf8', input: '' });
  return { status: r.status, out: `${r.stdout}\n${r.stderr}` };
}
function runAsync(script: string, env: Record<string, string>) {
  return new Promise<{ status: number | null; out: string }>((resolve) => {
    const c = spawn('npx', ['tsx', script], { cwd: API_DIR, env: cleanEnv(env), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    c.stdout.on('data', (d) => (out += d));
    c.stderr.on('data', (d) => (out += d));
    c.on('close', (status) => resolve({ status, out }));
  });
}
const bootstrapEnv = (url: string, db: string, extra: Record<string, string> = {}) => ({
  DATABASE_URL: url,
  ADMIN_EMAIL: ADMIN_EMAIL,
  ADMIN_NAME: 'Client Owner',
  ADMIN_PASSWORD: STRONG,
  BOOTSTRAP_CONFIRM_DB: db,
  ...extra,
});
const counts = async (p: PrismaClient) => ({ users: await p.user.count(), locations: await p.location.count(), products: await p.product.count() });

async function main() {
  console.log('== validation (pure functions) ==');
  ok(validateIdentity(ADMIN_EMAIL, 'A').length === 0, 'a normal lowercase email + name is accepted');
  ok(validateIdentity(undefined, 'A').length > 0 && validateIdentity('', 'A').length > 0, 'missing email rejected');
  ok(validateIdentity('not-an-email', 'A').length > 0, 'malformed email rejected');
  ok(validateIdentity('Owner@Client.example', 'A').length > 0, 'mixed-case email rejected (login is case-sensitive)');
  ok(validateIdentity(ADMIN_EMAIL, '  ').length > 0, 'blank name rejected');
  ok(validatePassword(ADMIN_EMAIL, STRONG).length === 0, 'a strong password is accepted');
  ok(validatePassword(ADMIN_EMAIL, 'Short1!').length > 0, 'short password rejected');
  ok(validatePassword(ADMIN_EMAIL, 'ChangeMe123!').length > 0, 'the public default password is rejected');
  ok(validatePassword(ADMIN_EMAIL, 'change-me-to-a-long-random-value').length > 0, 'the .env.example placeholder is rejected');
  ok(validatePassword(ADMIN_EMAIL, 'xxOWNERxx-long-enough-1').length > 0, 'password containing the email name rejected');
  ok(validatePassword(ADMIN_EMAIL, 'aaaaaaaaaaaaaaaaaaaa').length > 0, 'repetitive password rejected');

  try {
    console.log('\n== seed: fails closed in production ==');
    let db = await newDb(true);
    let r = run('prisma/seed.ts', { DATABASE_URL: db.url, NODE_ENV: 'production' });
    ok(r.status !== 0 && /Refusing to seed/.test(r.out), 'NODE_ENV=production with no override => refuses');
    ok((await counts(db.prisma)).users === 0 && (await counts(db.prisma)).products === 0, '...and wrote nothing');

    r = run('prisma/seed.ts', { DATABASE_URL: db.url, NODE_ENV: 'production', ALLOW_DEMO_SEED: 'true' });
    ok(r.status !== 0 && /SEED_DEMO_PASSWORD/.test(r.out), 'override without an explicit password => refuses (no silent public default)');
    r = run('prisma/seed.ts', { DATABASE_URL: db.url, NODE_ENV: 'production', ALLOW_DEMO_SEED: 'true', SEED_DEMO_PASSWORD: 'ChangeMe123!' });
    ok(r.status !== 0, 'override with the public default password => refuses');
    r = run('prisma/seed.ts', { DATABASE_URL: db.url, NODE_ENV: 'production', ALLOW_DEMO_SEED: 'true', SEED_DEMO_PASSWORD: 'short' });
    ok(r.status !== 0, 'override with a short password => refuses');
    ok((await counts(db.prisma)).users === 0, '...none of those wrote anything');

    await db.prisma.location.create({ data: { id: 'real-hq', name: 'Real Client Warehouse', type: 'WAREHOUSE' } });
    r = run('prisma/seed.ts', { DATABASE_URL: db.url, NODE_ENV: 'production', ALLOW_DEMO_SEED: 'true', SEED_DEMO_PASSWORD: STRONG });
    const c = await counts(db.prisma);
    ok(r.status !== 0 && /non-demo data/.test(r.out) && c.users === 0 && c.products === 0 && c.locations === 1, 'explicit override still refuses a database holding real (non-demo) data, and leaves it untouched');
    await db.prisma.$disconnect();

    db = await newDb(true);
    r = run('prisma/seed.ts', { DATABASE_URL: db.url, NODE_ENV: 'production', ALLOW_DEMO_SEED: 'true', SEED_DEMO_PASSWORD: STRONG });
    const seeded = await db.prisma.user.findUnique({ where: { email: 'admin@durby.tech' } });
    ok(r.status === 0 && !!seeded, 'staging escape hatch: explicit override + strong password + empty database => seeds');
    ok(!!seeded && (await bcrypt.compare(STRONG, seeded.passwordHash)) && !(await bcrypt.compare('ChangeMe123!', seeded.passwordHash)), '...with the supplied password, never the public default');
    ok(!r.out.includes(STRONG), '...and the password is not printed');
    await db.prisma.$disconnect();

    console.log('\n== seed: local development workflow unchanged ==');
    db = await newDb(true);
    r = run('prisma/seed.ts', { DATABASE_URL: db.url });
    const dev = await counts(db.prisma);
    const devAdmin = await db.prisma.user.findUnique({ where: { email: 'admin@durby.tech' } });
    ok(r.status === 0 && dev.users === 9 && dev.locations === 6 && dev.products === 47, 'no NODE_ENV => seeds 9 users, 6 locations, 47 products as before');
    ok(!!devAdmin && (await bcrypt.compare('ChangeMe123!', devAdmin.passwordHash)), '...with the documented dev default password');
    ok(!r.out.includes('ChangeMe123!'), '...but the password is no longer printed in the log');
    r = run('prisma/seed.ts', { DATABASE_URL: db.url });
    ok(r.status === 0 && (await counts(db.prisma)).users === 9, 'rerunning the local seed is still idempotent');
    await db.prisma.$disconnect();

    console.log('\n== bootstrap: creates exactly one real administrator ==');
    db = await newDb(true);
    const before = await counts(db.prisma);
    ok(before.users === 0 && before.locations === 0 && before.products === 0, 'a freshly migrated database has no users, locations or products');
    ok((await db.prisma.codeSequence.count()) === 5, '...but migrations already created the 5 code sequences (REQ, TR, OC, DC, INV)');
    // Categories are only backfilled from existing products at migration time, so a real (empty) deployment starts with none:
    // an administrator creates them via POST /categories before the Add Product form can be used (documented in DEPLOY.md).
    ok((await db.prisma.productCategory.count()) === 0, '...and no product categories (created by an administrator via the API)');

    for (const [label, env] of [
      ['missing ADMIN_EMAIL', { ADMIN_EMAIL: '' }],
      ['uppercase email', { ADMIN_EMAIL: 'Owner@Client.example' }],
      ['weak password', { ADMIN_PASSWORD: 'Short1!' }],
      ['the public default password', { ADMIN_PASSWORD: 'ChangeMe123!' }],
      ['missing database confirmation', { BOOTSTRAP_CONFIRM_DB: '' }],
      ['wrong database confirmation', { BOOTSTRAP_CONFIRM_DB: 'some_other_db' }],
    ] as [string, Record<string, string>][]) {
      r = run('prisma/bootstrap-admin.ts', bootstrapEnv(db.url, db.name, env));
      ok(r.status !== 0 && (await counts(db.prisma)).users === 0, `refuses: ${label}; nothing created`);
    }
    const noPw = bootstrapEnv(db.url, db.name);
    delete (noPw as Record<string, string | undefined>).ADMIN_PASSWORD;
    r = run('prisma/bootstrap-admin.ts', noPw);
    ok(r.status !== 0 && /ADMIN_PASSWORD|terminal/i.test(r.out) && (await counts(db.prisma)).users === 0, 'refuses when there is no terminal and no ADMIN_PASSWORD; nothing created');

    r = run('prisma/bootstrap-admin.ts', bootstrapEnv(db.url, db.name));
    const users = await db.prisma.user.findMany();
    ok(r.status === 0 && users.length === 1, 'valid inputs => exactly one user created');
    ok(users[0]?.role === 'SUPER_ADMIN' && users[0]?.email === ADMIN_EMAIL && users[0]?.active === true && users[0]?.locationId === null, '...an active SUPER_ADMIN with the requested email');
    ok(!!users[0] && users[0].passwordHash.startsWith('$2') && (await bcrypt.compare(STRONG, users[0].passwordHash)), '...whose password is stored only as a bcrypt hash that verifies');
    ok(!r.out.includes(STRONG) && !JSON.stringify(users[0]).includes(STRONG), '...and the password appears nowhere in the output or the row');
    const after = await counts(db.prisma);
    ok(after.locations === 0 && after.products === 0, 'no demo (or any) branches or products were created');

    console.log('\n== bootstrap: reruns and duplicates ==');
    r = run('prisma/bootstrap-admin.ts', bootstrapEnv(db.url, db.name));
    ok(r.status === 3 && (await counts(db.prisma)).users === 1, 'rerun with the same details => refuses (exit 3), still exactly one user');
    r = run('prisma/bootstrap-admin.ts', bootstrapEnv(db.url, db.name, { ADMIN_EMAIL: 'second.admin@client-company.example' }));
    ok(r.status === 3 && (await counts(db.prisma)).users === 1, 'a different admin email is refused too: no accidental second bootstrap admin');
    await db.prisma.$disconnect();

    db = await newDb(true);
    const [a, b] = await Promise.all([
      runAsync('prisma/bootstrap-admin.ts', bootstrapEnv(db.url, db.name, { ADMIN_EMAIL: 'first@client-company.example' })),
      runAsync('prisma/bootstrap-admin.ts', bootstrapEnv(db.url, db.name, { ADMIN_EMAIL: 'second@client-company.example' })),
    ]);
    ok([a.status, b.status].filter((s) => s === 0).length === 1 && (await db.prisma.user.count()) === 1, 'two simultaneous bootstrap runs => exactly one succeeds (advisory lock)');
    await db.prisma.$disconnect();

    console.log('\n== bootstrap: does not assume the database is empty ==');
    db = await newDb(true);
    await db.prisma.user.create({ data: { email: 'manager@durby.tech', name: 'Demo Manager', role: 'WAREHOUSE_MANAGER', passwordHash: 'x' } });
    r = run('prisma/bootstrap-admin.ts', bootstrapEnv(db.url, db.name));
    ok(r.status === 3 && (await counts(db.prisma)).users === 1, 'a database with any existing user (e.g. demo-seeded, no admin) is refused and left untouched');
    await db.prisma.$disconnect();
    db = await newDb(true);
    run('prisma/seed.ts', { DATABASE_URL: db.url });
    r = run('prisma/bootstrap-admin.ts', bootstrapEnv(db.url, db.name));
    ok(r.status === 3 && (await counts(db.prisma)).users === 9, 'a demo-seeded database is refused and left untouched');
    await db.prisma.$disconnect();

    db = await newDb(false);
    r = run('prisma/bootstrap-admin.ts', bootstrapEnv(db.url, db.name));
    ok(r.status !== 0 && /migrate deploy/.test(r.out), 'an unmigrated database => clear "run migrate deploy first" message');
    await db.prisma.$disconnect();
  } finally {
    await admin.$disconnect();
    const cleanup = new PrismaClient({ datasourceUrl: BASE_URL });
    for (const name of created) await cleanup.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`).catch(() => {});
    await cleanup.$disconnect();
  }

  console.log(`\n${fail === 0 ? '✅ All checks passed.' : `❌ ${fail} check(s) failed.`} (${pass} passed, ${fail} failed)`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('CRASHED:', err);
  process.exit(1);
});
