/**
 * Regression tests for the findings of the full Playwright audit that are enforced on the server:
 *   1. Single warehouse (sequential AND concurrent creation, re-activation, deterministic lookup)
 *   2. Approved quantity limits (0 <= approved <= requested, whole numbers), and that invalid values never reserve stock
 *   3. Unknown / duplicate / inactive productIds return a clear 4xx (never a 500), across related endpoints
 *
 * Disposable: scratch Postgres database + scratch Redis container + the COMPILED API on a scratch port.
 * Run with: npm run test:audit-fixes   (builds first; needs Docker and a Postgres role that can CREATE DATABASE)
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const BASE_URL = process.env.DATABASE_URL;
if (!BASE_URL) throw new Error('DATABASE_URL is required (points at a Postgres that may CREATE DATABASE)');
const API_DIR = process.cwd();
const PORT = 3930 + Math.floor(Math.random() * 9);
const REDIS_PORT = 6430 + Math.floor(Math.random() * 9);
const REDIS_NAME = `durby-afix-redis-${process.pid}`;
const JWT_SECRET = 'afix-' + 'x'.repeat(48);
const API = `http://127.0.0.1:${PORT}/api`;

let pass = 0, fail = 0;
const ok = (c: boolean, l: string, _detail?: unknown) => { if (c) { pass++; console.log(`✓ ${l}`); } else { fail++; console.log(`✗ FAIL: ${l}`); } };
const statuses: number[] = [];
let ipN = 10;
async function call(method: string, path: string, opts: { token?: string; body?: unknown; file?: { name: string; type: string; data: Buffer; fields: Record<string, string> } } = {}) {
  const headers: Record<string, string> = { 'X-Forwarded-For': `198.51.100.${ipN++ % 250}`, ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) };
  let body: BodyInit | undefined;
  if (opts.file) { const f = new FormData(); f.append('file', new Blob([new Uint8Array(opts.file.data)], { type: opts.file.type }), opts.file.name); for (const [k, v] of Object.entries(opts.file.fields)) f.append(k, v); body = f; }
  else if (opts.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.body); }
  const res = await fetch(API + path, { method, headers, body });
  statuses.push(res.status);
  const text = await res.text(); let data: any; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, raw: text };
}
const sh = (cmd: string, args: string[], env: Record<string, string> = {}) => spawnSync(cmd, args, { cwd: API_DIR, env: { ...process.env, ...env }, encoding: 'utf8' });
const urlFor = (db: string) => { const u = new URL(BASE_URL!); u.pathname = `/${db}`; return u.toString(); };

async function main() {
  const dbName = `afix_${Date.now()}`;
  const admin = new PrismaClient({ datasourceUrl: BASE_URL });
  let server: ChildProcess | undefined, prisma: PrismaClient | undefined, redisUp = false, crashed = false;
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
    const dbUrl = urlFor(dbName);
    if (sh('npx', ['prisma', 'migrate', 'deploy'], { DATABASE_URL: dbUrl }).status !== 0) throw new Error('migrate deploy failed');
    const run = spawnSync('docker', ['run', '-d', '--rm', '--name', REDIS_NAME, '-p', `${REDIS_PORT}:6379`, 'redis:7-alpine'], { encoding: 'utf8' });
    if (run.status !== 0) throw new Error('scratch redis: ' + run.stderr);
    redisUp = true;
    for (let i = 0; i < 30; i++) { if (spawnSync('docker', ['exec', REDIS_NAME, 'redis-cli', 'ping'], { encoding: 'utf8' }).stdout.includes('PONG')) break; await new Promise((r) => setTimeout(r, 300)); }
    const OWNER = 'owner@afix-company.io', OWNER_PW = 'Zebra-Quartz-Meadow-2026x';
    const boot = sh('npx', ['tsx', 'prisma/bootstrap-admin.ts'], { DATABASE_URL: dbUrl, ADMIN_EMAIL: OWNER, ADMIN_NAME: 'Owner', ADMIN_PASSWORD: OWNER_PW, BOOTSTRAP_CONFIRM_DB: dbName });
    if (boot.status !== 0) throw new Error('bootstrap failed: ' + boot.stdout + boot.stderr);
    server = spawn('node', ['dist/main.js'], { cwd: API_DIR, env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', DATABASE_URL: dbUrl, PORT: String(PORT), NODE_ENV: 'production', JWT_SECRET, REDIS_HOST: '127.0.0.1', REDIS_PORT: String(REDIS_PORT), REDIS_PASSWORD: '', CORS_ORIGIN: 'http://localhost', TRUST_PROXY: '127.0.0.1' } });
    for (let i = 0; i < 60; i++) { try { if ((await fetch(`${API}/health`)).ok) break; } catch { /* not up */ } await new Promise((r) => setTimeout(r, 500)); }
    prisma = new PrismaClient({ datasourceUrl: dbUrl });
    const login = async (email: string, password: string) => (await call('POST', '/auth/login', { body: { email, password } })).data.accessToken as string;
    const tok = await login(OWNER, OWNER_PW);

    // ============ 1. single warehouse ============
    console.log('\n== 1. exactly one active warehouse ==');
    const par = await Promise.all(['A', 'B', 'C', 'D', 'E', 'F'].map((n) => call('POST', '/locations', { token: tok, body: { name: `Race Warehouse ${n}`, type: 'WAREHOUSE' } })));
    ok(par.filter((r) => r.status === 201).length === 1 && par.filter((r) => r.status === 409).length === 5, `six simultaneous "create warehouse" calls: exactly one succeeds, five get 409 (${par.map((r) => r.status).join('/')})`);
    ok((await prisma.location.count({ where: { type: 'WAREHOUSE' } })) === 1, '...and only one warehouse row exists');
    const wh1 = par.find((r) => r.status === 201)!.data.id as string;
    const dup = await call('POST', '/locations', { token: tok, body: { name: 'Second Warehouse', type: 'WAREHOUSE' } });
    ok(dup.status === 409 && /already exists/i.test(dup.data.message) && /exactly one/i.test(dup.data.message), 'a later duplicate is a clear 409 that names the existing warehouse and the rule', dup.data.message);
    const b1 = (await call('POST', '/locations', { token: tok, body: { name: 'Branch One', type: 'BRANCH' } })).data.id as string;
    const b2 = await call('POST', '/locations', { token: tok, body: { name: 'Branch Two', type: 'BRANCH' } });
    ok(b2.status === 201, 'any number of branches can still be created');
    ok((await call('PATCH', `/locations/${wh1}`, { token: tok, body: { type: 'BRANCH' } })).status === 400, 'a warehouse cannot be turned into a branch (or the reverse) by editing: `type` is not editable');
    // replace: deactivate, create a new one, the old one cannot come back
    ok((await call('POST', `/locations/${wh1}/deactivate`, { token: tok })).status < 300, 'the warehouse can be deactivated');
    const wh2r = await call('POST', '/locations', { token: tok, body: { name: 'Replacement Warehouse', type: 'WAREHOUSE' } });
    ok(wh2r.status === 201, 'with no ACTIVE warehouse, a replacement can be created');
    const wh2 = wh2r.data.id as string;
    ok((await call('POST', `/locations/${wh1}/activate`, { token: tok })).status === 409, 're-activating the old warehouse while another is active is refused (409)');
    ok((await call('PATCH', `/locations/${wh1}`, { token: tok, body: { active: true } })).status === 409, '...also through PATCH { active: true } (409)');
    ok((await prisma.location.count({ where: { type: 'WAREHOUSE', active: true } })) === 1, 'still exactly one ACTIVE warehouse');
    await call('POST', `/locations/${wh2}/deactivate`, { token: tok });
    const race = await Promise.all([call('POST', `/locations/${wh1}/activate`, { token: tok }), call('POST', `/locations/${wh2}/activate`, { token: tok })]);
    ok(race.filter((r) => r.status < 300).length === 1 && race.filter((r) => r.status === 409).length === 1 && (await prisma.location.count({ where: { type: 'WAREHOUSE', active: true } })) === 1, `two simultaneous re-activations: exactly one wins (${race.map((r) => r.status).join('/')})`);
    const activeWh = (await prisma.location.findFirstOrThrow({ where: { type: 'WAREHOUSE', active: true } })).id;
    ok(activeWh === wh1 || activeWh === wh2, 'one active warehouse remains');
    for (const l of await prisma.location.findMany({ where: { type: 'WAREHOUSE', active: true, id: { not: wh1 } } })) await prisma.location.update({ where: { id: l.id }, data: { active: false } });
    await prisma.location.update({ where: { id: wh1 }, data: { active: true } });

    // fixtures: category, product, manager, branch user, stock
    const cat = (await call('POST', '/categories', { token: tok, body: { name: 'AFix Category' } })).data.id as string;
    const mkProd = async (sku: string) => (await call('POST', '/products', { token: tok, body: { sku, name: `AFix ${sku}`, category: 'AFix Category', categoryId: cat, unit: 'kg', unitPrice: 1 } })).data.id as string;
    const P = await mkProd('AFIX-1'); const P2 = await mkProd('AFIX-2');
    await call('POST', '/users', { token: tok, body: { email: 'mgr@afix-company.io', name: 'Manager', password: 'Manager-Pass-Word-2026x', role: 'WAREHOUSE_MANAGER', requirePasswordChange: false } });
    await call('POST', '/users', { token: tok, body: { email: 'branch@afix-company.io', name: 'Branch User', password: 'Branch-Pass-Word-2026x', role: 'BRANCH_USER', locationId: b1, requirePasswordChange: false } });
    const mgr = await login('mgr@afix-company.io', 'Manager-Pass-Word-2026x'), br = await login('branch@afix-company.io', 'Branch-Pass-Word-2026x');
    ok((await call('POST', '/inventory/adjustments', { token: mgr, body: { locationId: wh1, productId: P, quantity: 100, reason: 'RECOUNT' } })).status < 300, 'fixture: 100 units of stock in the warehouse');
    const stock = async () => { const r = await prisma!.inventoryItem.findUniqueOrThrow({ where: { locationId_productId: { locationId: wh1, productId: P } } }); return `${r.onHand}/${r.reserved}`; };

    // ============ 2. approved quantity ============
    console.log('\n== 2. approved quantity limits ==');
    const req = await call('POST', '/requests', { token: br, body: { items: [{ productId: P, requestedQty: 15 }] } });
    ok(req.status === 201, 'branch requests 15 units', String(req.status));
    const rid = req.data.id as string;
    await call('POST', `/requests/${rid}/review`, { token: mgr });
    const patch = (approvedQty: unknown, productId = P, id = rid) => call('PATCH', `/requests/${id}/items`, { token: mgr, body: { productId, approvedQty } });
    for (const [label, v] of [['16 (one above)', 16], ['500', 500], ['-1', -1], ['1.5', 1.5], ['"abc"', 'abc'], ['null', null], ['"15" as text', '15'], ['1000001', 1000001]] as [string, unknown][]) {
      const r = await patch(v);
      ok(r.status >= 400 && r.status < 500, `approved quantity ${label} is refused with a 4xx (${r.status})`);
    }
    const over = await patch(16);
    ok(/cannot exceed the requested quantity \(15\)/.test(JSON.stringify(over.data)), 'the message names the limit (requested 15)', JSON.stringify(over.data.message));
    const item = await prisma.stockRequestItem.findFirstOrThrow({ where: { requestId: rid } });
    ok(item.approvedQty === null && (await stock()) === '100/0', 'none of the invalid updates changed the stored quantity or touched stock (100/0)');
    ok((await patch(15)).status === 200 && (await patch(0)).status === 200 && (await patch(10)).status === 200, 'valid values 15, 0 and 10 are accepted');
    ok((await patch(5, P2)).status === 404, 'a product that is not on the request is a 404');
    ok((await patch(5, P, 'ckunknownrequest0000000000')).status === 404, 'an unknown request id is a 404');
    ok((await stock()) === '100/0', 'editing quantities reserves nothing');
    // defence in depth: bad data that bypassed the API is still refused at approval
    await prisma.stockRequestItem.update({ where: { id: item.id }, data: { approvedQty: 500 } });
    const bad = await call('POST', `/requests/${rid}/approve`, { token: mgr });
    ok(bad.status === 409 && (await stock()) === '100/0' && (await prisma.stockRequest.findUniqueOrThrow({ where: { id: rid } })).status === 'REVIEWING' && (await prisma.transfer.count()) === 0, 'approval refuses an out-of-range stored quantity (409): nothing reserved, no transfer, status unchanged');
    await patch(10);
    const good = await call('POST', `/requests/${rid}/approve`, { token: mgr });
    ok(good.status === 201 && (await stock()) === '100/10', 'a valid approval (10 of 15) reserves exactly 10 and deducts nothing (onHand 100, reserved 10)', await stock());
    // deterministic lookup: a second ACTIVE warehouse that only exists as bad legacy data never wins
    const dirty = await prisma.location.create({ data: { name: 'Dirty Legacy Warehouse', type: 'WAREHOUSE', active: true } });
    const r2 = await call('POST', '/requests', { token: br, body: { items: [{ productId: P, requestedQty: 5 }] } });
    await call('POST', `/requests/${r2.data.id}/review`, { token: mgr });
    await call('POST', `/requests/${r2.data.id}/approve`, { token: mgr });
    ok((await stock()) === '100/15' && (await prisma.inventoryItem.count({ where: { locationId: dirty.id, reserved: { gt: 0 } } })) === 0, 'even with a stray second warehouse row, the OLDEST active warehouse is always used (reserved 15 there, 0 on the stray)');
    await prisma.location.delete({ where: { id: dirty.id } }).catch(() => prisma!.location.update({ where: { id: dirty.id }, data: { active: false } }));

    // ============ 3. invalid products ============
    console.log('\n== 3. unknown products are a 4xx, never a 500 ==');
    const reqCount = await prisma.stockRequest.count();
    const cases: [string, unknown][] = [['unknown id', [{ productId: 'ckunknownproduct000000000', requestedQty: 1 }]], ['empty-looking id', [{ productId: 'x', requestedQty: 1 }]], ['known + unknown', [{ productId: P, requestedQty: 1 }, { productId: 'ckunknownproduct000000000', requestedQty: 1 }]], ['the same product twice', [{ productId: P, requestedQty: 1 }, { productId: P, requestedQty: 2 }]], ['SQL-ish id', [{ productId: "'; DROP TABLE \"Product\"; --", requestedQty: 1 }]]];
    for (const [label, items] of cases) { const r = await call('POST', '/requests', { token: br, body: { items } }); ok(r.status === 400, `POST /requests with ${label} is a clear 400 (${r.status})`); }
    ok((await prisma.stockRequest.count()) === reqCount && (await prisma.product.count()) === 2, 'no request was created and no table was harmed');
    await call('POST', `/products/${P2}/deactivate`, { token: tok });
    ok((await call('POST', '/requests', { token: br, body: { items: [{ productId: P2, requestedQty: 1 }] } })).status === 400, 'an inactive (deactivated) product cannot be requested (400)');
    const a1 = (await call('POST', '/inventory/adjustments', { token: mgr, body: { locationId: wh1, productId: 'ckunknownproduct000000000', quantity: 1, reason: 'RECOUNT' } })).status; ok(a1 === 404, `stock adjustment with an unknown product is a clear 4xx (${a1})`);
    const a2 = (await call('POST', '/inventory/adjustments', { token: mgr, body: { locationId: 'ckunknownlocation00000000', productId: P, quantity: 1, reason: 'RECOUNT' } })).status; ok(a2 === 404, `stock adjustment with an unknown location is a clear 4xx (${a2})`);
    const csv = await call('POST', '/supplier-invoices/upload', { token: tok, file: { name: 'i.csv', type: 'text/csv', data: Buffer.from('Description,Code,Qty\nAFix AFIX-1,AFIX-1,3\n'), fields: { supplierName: 'S', invoiceNumber: 'AF-1' } } });
    ok(csv.status === 201, 'fixture: a supplier invoice');
    const ii = csv.data.items[0].id as string;
    ok((await call('PATCH', `/supplier-invoices/${csv.data.id}/items/${ii}`, { token: tok, body: { productId: 'ckunknownproduct000000000' } })).status === 400, 'matching an invoice line to an unknown product is a 400');
    ok((await call('PATCH', `/supplier-invoices/${csv.data.id}/items/ckunknownitem0000000000`, { token: tok, body: { receivedQty: 1 } })).status === 404, 'editing an unknown invoice line is a 404');
    ok((await call('POST', '/users/invitations', { token: mgr, body: { email: 'nb@afix-company.io', name: 'N', role: 'BRANCH_USER', locationId: 'ckunknownlocation00000000' } })).status === 400, 'inviting a branch user into an unknown branch is a 400');
    ok(!statuses.some((s) => s >= 500), `none of the ${statuses.length} requests returned a 5xx`);
  } catch (e) { crashed = true; console.error('CRASHED:', e); }
  finally {
    if (server) server.kill('SIGTERM');
    if (prisma) await prisma.$disconnect();
    await new Promise((r) => setTimeout(r, 500));
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`).catch(() => {});
    await admin.$disconnect();
    if (redisUp) spawnSync('docker', ['rm', '-f', REDIS_NAME]);
    console.log(`\n${crashed ? '❌ The test crashed.' : fail === 0 ? '✅ All checks passed.' : `❌ ${fail} check(s) failed.`} (${pass} passed, ${fail} failed)`);
    process.exit(fail === 0 && !crashed ? 0 : 1);
  }
}
main();
