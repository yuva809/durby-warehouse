/**
 * End-to-end tests (real API, scratch database) for supplier invoices with cartons / pack sizes / prices / batch + expiry / free lines:
 *   - the columnar PDF layout is read into stored lines; totals are validated; the uploader's typed values are held to the document
 *   - free-of-charge lines keep their quantity; stock is received in CARTONS (paid + free), with the individual-unit equivalent kept
 *   - duplicate invoices are refused (a cancelled one does not count); legacy CSV/Excel invoices still work unchanged
 *   - products: configurable stock unit, validated pack size; an unmatched line can be left out explicitly
 *
 * Disposable: scratch Postgres database + scratch Redis container + the COMPILED API on a scratch port.
 * Run with: npm run test:invoice-lines   (builds first; needs Docker and a Postgres role that can CREATE DATABASE)
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { fixtureText, textPdf } from './columnar-fixture';

const BASE_URL = process.env.DATABASE_URL;
if (!BASE_URL) throw new Error('DATABASE_URL is required (points at a Postgres that may CREATE DATABASE)');
const API_DIR = process.cwd();
const PORT = 3940 + Math.floor(Math.random() * 9);
const REDIS_PORT = 6440 + Math.floor(Math.random() * 9);
const REDIS_NAME = `durby-invlines-redis-${process.pid}`;
const JWT_SECRET = 'invl-' + 'x'.repeat(48);
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
  const dbName = `invl_${Date.now()}`;
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
    const OWNER = 'owner@invl-company.io', OWNER_PW = 'Zebra-Quartz-Meadow-2026x';
    const boot = sh('npx', ['tsx', 'prisma/bootstrap-admin.ts'], { DATABASE_URL: dbUrl, ADMIN_EMAIL: OWNER, ADMIN_NAME: 'Owner', ADMIN_PASSWORD: OWNER_PW, BOOTSTRAP_CONFIRM_DB: dbName });
    if (boot.status !== 0) throw new Error('bootstrap failed: ' + boot.stdout + boot.stderr);
    server = spawn('node', ['dist/main.js'], { cwd: API_DIR, env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', DATABASE_URL: dbUrl, PORT: String(PORT), NODE_ENV: 'production', JWT_SECRET, REDIS_HOST: '127.0.0.1', REDIS_PORT: String(REDIS_PORT), REDIS_PASSWORD: '', CORS_ORIGIN: 'http://localhost', TRUST_PROXY: '127.0.0.1' } });
    for (let i = 0; i < 60; i++) { try { if ((await fetch(`${API}/health`)).ok) break; } catch { /* not up */ } await new Promise((r) => setTimeout(r, 500)); }
    prisma = new PrismaClient({ datasourceUrl: dbUrl });
    const login = async (email: string, password: string) => (await call('POST', '/auth/login', { body: { email, password } })).data.accessToken as string;
    const tok = await login(OWNER, OWNER_PW);

    // fixtures: warehouse, category, products (SKU = the supplier's item code, which is how invoice lines are matched)
    const wh = await call('POST', '/locations', { token: tok, body: { name: 'E2E TEST - Warehouse', type: 'WAREHOUSE', city: 'Berlin' } });
    ok(wh.status === 201, 'fixture: warehouse');
    const cat = (await call('POST', '/categories', { token: tok, body: { name: 'E2E TEST - Category' } })).data.id as string;
    const mk = (sku: string, name: string, extra: Record<string, unknown> = {}) => call('POST', '/products', { token: tok, body: { sku, name, category: 'E2E TEST - Category', categoryId: cat, unit: 'carton', unitPrice: 5, ...extra } });

    console.log('\n== 1. products: stock unit and pack size ==');
    const ginger = await mk('1001', 'E2E Ginger Beer 24x330ML', { packSize: 24 });
    ok(ginger.status === 201 && ginger.data.unit === 'carton' && ginger.data.packSize === 24, 'a product is created with stock unit "carton" and 24 units per carton');
    const gId = ginger.data.id as string;
    for (const bad of [0, -3, 1.5, 'abc', 1000001]) {
      const r = await call('PATCH', `/products/${gId}`, { token: tok, body: { packSize: bad } });
      ok(r.status === 400, `packSize ${JSON.stringify(bad)} is refused with 400 (got ${r.status})`);
    }
    const bad2 = await mk('1099', 'E2E Bad Pack', { packSize: 0 });
    ok(bad2.status === 400, 'creating a product with packSize 0 is refused');
    ok((await call('PATCH', `/products/${gId}`, { token: tok, body: { unit: 'box' } })).data.unit === 'box' && (await call('PATCH', `/products/${gId}`, { token: tok, body: { unit: 'carton' } })).data.unit === 'carton', 'the stock unit is configurable per product (carton -> box -> carton)');
    const pNoodles = (await mk('1002', 'E2E Noodles 40x75GR', { packSize: 40 })).data.id as string;
    const pSpice = (await mk('1003', 'E2E Spice Mix 12x10GR', { packSize: 12 })).data.id as string;
    const pSauce = (await mk('1004', 'E2E Sauce 6x400G', { packSize: 6 })).data.id as string;

    console.log('\n== 2. upload of the columnar PDF ==');
    const pdf = (text = fixtureText()) => ({ name: 'Invoice nr. 90000001.PDF.pdf', type: 'application/pdf', data: textPdf(text.split('\n')) });
    const SUPPLIER = 'E2E TEST - Columnar Supplier';
    const fields = (o: Record<string, string> = {}) => ({ supplierName: SUPPLIER, invoiceNumber: '90000001', invoiceDate: '2026-09-19', invoiceTotal: '341.36', ...o });
    const up = (o: Record<string, string> = {}, text?: string) => call('POST', '/supplier-invoices/upload', { token: tok, file: { ...pdf(text), fields: fields(o) } });
    const count = () => prisma!.supplierInvoice.count();

    let r = await up({ invoiceNumber: '12' });
    ok(r.status === 422 && /does not match the number printed on the file \(90000001\)/.test(r.data.message) && (await count()) === 0, 'a wrong invoice number is refused (422) and nothing is stored');
    r = await up({ invoiceTotal: '999.99' });
    ok(r.status === 422 && /does not match the total printed on the file \(341\.36\)/.test(r.data.message) && (await count()) === 0, 'a wrong expected total is refused (422) and nothing is stored');
    r = await up({ invoiceTotal: 'abc' });
    ok(r.status === 400 && (await count()) === 0, 'a non-numeric total is a clear 400');
    r = await up({ invoiceTotal: '-5' });
    ok(r.status === 400, 'a negative total is a clear 400');

    r = await up();
    ok(r.status === 201, `the correct upload succeeds (${r.status} ${r.status === 201 ? '' : JSON.stringify(r.data).slice(0, 200)})`);
    const inv = r.data;
    ok(inv.status === 'UNDER_REVIEW' && inv.items.length === 6, 'stored UNDER_REVIEW with 6 lines');
    ok(Number(inv.invoiceTotal) === 341.36 && Number(inv.linesTotal) === 341.36 && inv.currency === 'EUR', 'invoice total 341.36 and lines total 341.36 (EUR) are stored');
    ok(inv.invoiceDate?.startsWith('2026-09-19'), 'the invoice date is stored');
    ok(inv.warnings.some((w: string) => /Total check: the 6 lines add up to 341\.36, matching the invoice total/.test(w)), 'the response reports that the totals match');
    const byCode = (code: string, free: boolean) => inv.items.find((i: any) => i.rawProductCode === code && i.isFree === free);
    const gPaid = byCode('1001', false), gFree = byCode('1001', true);
    ok(gPaid.invoiceQty === 15 && gPaid.packSize === 24 && gPaid.totalUnits === 360 && Number(gPaid.unitPrice) === 0.56 && gPaid.priceBasis === 'UNIT' && Number(gPaid.lineAmount) === 201.6, 'paid line: 15 cartons x 24 = 360 units, price 0.56 per UNIT, amount 201.60');
    ok(gPaid.batchNumber === '900001' && gPaid.expiryDate?.startsWith('2027-09-03'), 'batch number and expiry date are stored');
    ok(gFree.invoiceQty === 3 && gFree.totalUnits === 72 && Number(gFree.unitPrice) === 0 && gFree.priceBasis === null && gFree.receivedQty === 3, 'free line: 3 cartons = 72 units kept, price 0, received quantity pre-filled with 3');
    ok(byCode('1002', false).priceBasis === 'CARTON', 'a carton-priced line is stored as CARTON');
    ok(inv.items.filter((i: any) => i.isFree).length === 2, 'two free-of-charge lines (ginger beer free twin, promo item)');
    ok(['1001', '1002', '1003', '1004'].every((c) => inv.items.filter((i: any) => i.rawProductCode === c).every((i: any) => i.productId && i.needsReview === false)), 'lines matched by code to a product are trusted (not flagged) -- including the paid/free twin, which is not a duplicate');
    const promo = inv.items.find((i: any) => i.rawProductCode === '1' && i.rawDescription.includes('PROMO'));
    ok(promo.needsReview === true, 'the promo line (no product) needs review');
    ok((await prisma.inventoryItem.count({ where: { onHand: { gt: 0 } } })) === 0 && (await prisma.inventoryMovement.count()) === 0, 'uploading changed no stock');

    console.log('\n== 3. duplicates ==');
    r = await up();
    ok(r.status === 409 && new RegExp(`already uploaded as ${inv.code}`).test(r.data.message) && (await count()) === 1, 'the same supplier + invoice number is refused (409) and names the existing record');
    r = await up({ supplierName: SUPPLIER.toUpperCase() });
    ok(r.status === 409 && (await count()) === 1, '...also with different letter case');

    console.log('\n== 4. confirming: stock in CARTONS, paid + free ==');
    r = await call('POST', `/supplier-invoices/${inv.id}/confirm`, { token: tok });
    ok(r.status === 409, 'confirm is refused while the promo line is unresolved');
    ok((await call('PATCH', `/supplier-invoices/${inv.id}/items/${promo.id}`, { token: tok, body: { productId: null } })).status < 300, 'the promo line is explicitly left unmatched');
    r = await call('POST', `/supplier-invoices/${inv.id}/confirm`, { token: tok });
    ok(r.status === 409 && /set its received quantity to 0/.test(r.data.message), 'an unmatched line with a quantity still blocks confirm, and says how to leave it out');
    ok((await call('PATCH', `/supplier-invoices/${inv.id}/items/${promo.id}`, { token: tok, body: { receivedQty: 0 } })).status < 300, 'the promo line is set to receive 0');
    ok((await prisma.inventoryMovement.count()) === 0, 'still no stock before confirmation');
    r = await call('POST', `/supplier-invoices/${inv.id}/confirm`, { token: tok });
    ok(r.status === 201 || r.status === 200, `confirm succeeds (${r.status} ${r.status < 300 ? '' : JSON.stringify(r.data).slice(0, 200)})`);
    const onHand = async (id: string) => (await prisma!.inventoryItem.findFirst({ where: { productId: id } }))?.onHand ?? 0;
    ok((await onHand(gId)) === 18, 'Ginger Beer stock is 18 cartons (15 paid + 3 free), not 432');
    ok((await onHand(pNoodles)) === 5 && (await onHand(pSpice)) === 3 && (await onHand(pSauce)) === 4, 'other products received in cartons: 5, 3, 4');
    const moves = await prisma.inventoryMovement.findMany({ orderBy: { createdAt: 'asc' } });
    ok(moves.length === 5 && moves.every((m) => m.type === 'RECEIPT' && m.reference === inv.code) && moves.reduce((a, m) => a + m.quantity, 0) === 30, '5 receipt movements totalling 30 cartons (the promo line added nothing)');
    ok((await prisma.inventoryMovement.count({ where: { productId: gId } })) === 2, 'the paid and free ginger beer lines are two movements');
    let ledgerOk = true;
    for (const it of await prisma.inventoryItem.findMany()) { const s = await prisma.inventoryMovement.aggregate({ where: { productId: it.productId, locationId: it.locationId }, _sum: { quantity: true } }); if ((s._sum.quantity ?? 0) !== it.onHand) ledgerOk = false; }
    ok(ledgerOk, 'ledger reconciles: every onHand equals the sum of its movements');
    const inventory = await call('GET', '/inventory', { token: tok });
    const gLine = inventory.data.items.find((i: any) => i.productId === gId);
    ok(gLine.unit === 'carton' && gLine.onHand === 18 && gLine.packSize === 24 && gLine.unitsOnHand === 432, 'the inventory report shows 18 cartons AND the 432-unit equivalent');
    const after = await call('GET', `/supplier-invoices/${inv.id}`, { token: tok });
    ok(after.data.status === 'CONFIRMED' && after.data.items.find((i: any) => i.id === promo.id).receivedQty === 0, 'invoice is CONFIRMED; the left-out line kept received = 0');
    const again = await call('POST', `/supplier-invoices/${inv.id}/confirm`, { token: tok });
    ok(again.status === 409 && (await prisma.inventoryMovement.count()) === 5 && (await onHand(gId)) === 18, 'a second confirm is refused and stock does not change');

    console.log('\n== 5. totals that do not add up, and rows that do not add up ==');
    const other = (n: string, total?: string, tweak?: (t: string) => string) => { const t0 = fixtureText(total ? { total } : {}).replace(/90000001/g, n); return tweak ? tweak(t0) : t0; };
    r = await call('POST', '/supplier-invoices/upload', { token: tok, file: { name: 'i2.pdf', type: 'application/pdf', data: textPdf(other('90000002', '400,00').split('\n')), fields: { supplierName: SUPPLIER, invoiceNumber: '90000002' } } });
    ok(r.status === 201 && Number(r.data.invoiceTotal) === 400 && Number(r.data.linesTotal) === 341.36, 'a document whose lines do not add up to its total is still stored for review, with both figures');
    ok(r.data.warnings.some((w: string) => /Total check FAILED.*341\.36.*400\.00/.test(w)), 'the mismatch is reported in the upload warnings');
    await call('POST', `/supplier-invoices/${r.data.id}/cancel`, { token: tok });
    r = await call('POST', '/supplier-invoices/upload', { token: tok, file: { name: 'i3.pdf', type: 'application/pdf', data: textPdf(other('90000003', undefined, (t) => t.replace('360,000 0,56 201,60', '350,000 0,56 196,00')).split('\n')), fields: { supplierName: SUPPLIER, invoiceNumber: '90000003' } } });
    ok(r.status === 201, 'a document with one inconsistent line is still stored');
    const sus = r.data.items.find((i: any) => i.rawProductCode === '1001' && !i.isFree);
    ok(sus.needsReview === true && sus.invoiceQty === 15 && sus.totalUnits === 350, 'the inconsistent line is stored as printed and flagged for review (never silently corrected)');
    ok(r.data.warnings.some((w: string) => /does not equal the printed 350,000 units/.test(w)), 'and the inconsistency is reported');
    const cSus = await call('POST', `/supplier-invoices/${r.data.id}/confirm`, { token: tok });
    ok(cSus.status === 409, 'that invoice cannot be confirmed until the flagged line is reviewed');
    await call('POST', `/supplier-invoices/${r.data.id}/cancel`, { token: tok });

    console.log('\n== 6. legacy CSV invoices are unchanged ==');
    const csvUp = (extra: Record<string, string> = {}, num = 'CSV-1') => call('POST', '/supplier-invoices/upload', { token: tok, file: { name: 'i.csv', type: 'text/csv', data: Buffer.from('Description,Code,Qty\nE2E Sauce 6x400G,1004,7\n'), fields: { supplierName: 'E2E TEST - CSV Supplier', invoiceNumber: num, ...extra } } });
    let c = await csvUp({ invoiceTotal: '10.50' });
    ok(c.status === 201 && c.data.items.length === 1 && c.data.items[0].invoiceQty === 7 && c.data.items[0].isFree === false && c.data.items[0].packSize === null && c.data.items[0].totalUnits === null && c.data.items[0].batchNumber === null, 'a CSV invoice loads exactly as before, with the new fields empty');
    ok(Number(c.data.invoiceTotal) === 10.5 && c.data.linesTotal === null, 'the typed total is stored when the file has none; no lines total');
    ok(c.data.items[0].productId === pSauce && c.data.items[0].needsReview === false, 'CSV rows still match by code and are not force-flagged');
    ok((await csvUp()).status === 409, 'the CSV duplicate is refused too');
    ok((await call('POST', `/supplier-invoices/${c.data.id}/cancel`, { token: tok })).status < 300, 'the CSV invoice is cancelled');
    ok((await call('POST', `/supplier-invoices/${c.data.id}/cancel`, { token: tok })).status === 409, 'cancelling twice is refused');
    ok((await csvUp()).status === 201, 'a CANCELLED invoice does not block uploading the same number again');
    const list = await call('GET', '/supplier-invoices', { token: tok });
    ok(list.status === 200 && list.data.length >= 4, 'the list endpoint still works with old and new invoices');
    ok((await prisma.inventoryMovement.count()) === 5 && (await onHand(gId)) === 18, 'nothing after the confirmation changed any stock');
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
