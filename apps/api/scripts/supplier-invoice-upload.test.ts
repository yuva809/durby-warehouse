/**
 * End-to-end tests for the supplier-invoice workflow: upload -> (text layer | OCR) -> parse -> review -> confirm / cancel.
 *
 * Regression for the production failure "Internal server error" on upload: a barcode on an invoice line
 * (e.g. 4915238934478) was read as a QUANTITY, did not fit the 32-bit integer column and crashed the insert
 * (Prisma: "Unable to fit integer value '4915238934478' into an INT4"). The parsers now treat barcodes as product
 * codes, refuse implausible quantities with a visible warning, and every bad-input path returns a clear 4xx.
 *
 * Disposable and self-contained: scratch Postgres database + scratch Redis container + the COMPILED API on a scratch port.
 *
 * OCR: by default (OCR_MODE=stub) the scanned-PDF path is exercised against an in-test HTTP server that speaks the real OCR
 * service's contract (POST /ocr -> { text, pages, confidence, processingTimeMs }) and replays REAL PaddleOCR output recorded from
 * the production OCR service (2026-09-25, 99.5% confidence). That proves the backend's OCR wiring (fallback trigger, client, parse,
 * review) but NOT PaddleOCR itself. With OCR_MODE=real it uploads the image-only fixture to the real service instead
 * (OCR_URL, default http://127.0.0.1:8001; fixture OCR_FIXTURE), which needs a native x86_64 PaddleOCR container.
 *
 * Run with: npm run test:supplier-invoice-upload   (builds first; needs Docker and a Postgres role that can CREATE DATABASE)
 * Optional: OCR_URL (default http://127.0.0.1:8001), OCR_FIXTURE (default ../../scripts/fixtures/ocr-smoke-invoice.pdf)
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { parseInvoiceTextLines } from '../src/supplier-invoices/parsers/text-row-parser';

const BASE_URL = process.env.DATABASE_URL;
if (!BASE_URL) throw new Error('DATABASE_URL is required (points at a Postgres that may CREATE DATABASE)');
const API_DIR = process.cwd();
const PORT = 3960 + Math.floor(Math.random() * 9);
const REDIS_PORT = 6420 + Math.floor(Math.random() * 9);
const REDIS_NAME = `durby-invtest-redis-${process.pid}`;
const JWT_SECRET = 'invtest-' + 'x'.repeat(48);
const OCR_MODE = process.env.OCR_MODE === 'real' ? 'real' : 'stub';
const OCR_URL = process.env.OCR_URL ?? 'http://127.0.0.1:8001';
const STUB_PORT = 8100 + Math.floor(Math.random() * 50);
const OCR_FIXTURE = process.env.OCR_FIXTURE ?? resolve(API_DIR, '../../scripts/fixtures/ocr-smoke-invoice.pdf');
const API = `http://127.0.0.1:${PORT}/api`;

let pass = 0;
let fail = 0;
let skipped = 0;
function ok(cond: boolean, label: string) {
  if (cond) { pass++; console.log(`✓ ${label}`); } else { fail++; console.log(`✗ FAIL: ${label}`); }
}
function skip(label: string) { skipped++; console.log(`- SKIPPED: ${label}`); }
const statuses: number[] = [];

/** A minimal one-page PDF WITH a text layer (like a machine-generated supplier invoice). */
function textPdf(lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, '\\$&');
  const stream = `BT /F1 11 Tf 50 780 Td 14 TL\n${lines.map((l) => `(${esc(l)}) Tj T*`).join('\n')}\nET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 5 0 R /Resources << /Font << /F1 4 0 R >> >> >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out);
}

/** Real PaddleOCR output for a scanned invoice, recorded from the production OCR service on 2026-09-25 (processingTimeMs 9275, confidence 99.5%). */
const RECORDED_OCR_TEXT = ['Fresh Tropical S.r.I.', 'Invoice No: 10136161', 'Date: 19.09.2026', 'ATTA VERMICELLI APNABABA 45', 'BOURNVITA 12', 'GINGER BEER 24', 'HORLIKS ORIGINAL 6', 'NESTLE MILO 10', 'MDH BUTTER CHICKEN MASALA 30', 'AASHIRVAAD MULTIGRAIN FLOUR 15', 'MAGGI MASALA NOODLES 20', 'INDOMIE NOODLES 40', 'Total Amount 1240.00'].join('\n');
function startOcrStub(mode: { fail: boolean }): { server: Server; calls: () => number } {
  let calls = 0;
  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') { res.end('{"status":"ok"}'); return; }
    req.on('data', () => {});
    req.on('end', () => {
      calls++;
      if (mode.fail) { res.statusCode = 502; res.setHeader('content-type', 'application/json'); res.end('{"detail":"OCR processing failed: simulated"}'); return; }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ text: RECORDED_OCR_TEXT, pages: [{ pageNumber: 1, text: RECORDED_OCR_TEXT, confidence: 0.995 }], confidence: 0.995, processingTimeMs: 9275 }));
    });
  });
  server.listen(STUB_PORT, '127.0.0.1');
  return { server, calls: () => calls };
}

let ipCounter = 10;
const ip = () => `198.51.100.${ipCounter++ % 250}`;
async function call(method: string, path: string, opts: { token?: string; body?: unknown } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip(), ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  statuses.push(res.status);
  const text = await res.text();
  let data: any;
  try { data = text ? JSON.parse(text) : undefined; } catch { data = text; }
  return { status: res.status, data, raw: text };
}
async function upload(token: string, file: { name: string; type: string; data: Buffer } | null, fields: Record<string, string>, timeoutMs = 60_000) {
  const form = new FormData();
  if (file) form.append('file', new Blob([new Uint8Array(file.data)], { type: file.type }), file.name);
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const res = await fetch(`${API}/supplier-invoices/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'X-Forwarded-For': ip() }, body: form, signal: AbortSignal.timeout(timeoutMs) });
  statuses.push(res.status);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, raw: text };
}
const sh = (cmd: string, args: string[], env: Record<string, string> = {}) => spawnSync(cmd, args, { cwd: API_DIR, env: { ...process.env, ...env }, encoding: 'utf8' });
const urlFor = (db: string) => { const u = new URL(BASE_URL!); u.pathname = `/${db}`; return u.toString(); };

async function main() {
  // ---------------- pure parser checks (no infrastructure) ----------------
  console.log('== A. parser: barcodes, quantities and columns ==');
  const sample = ['Alibaba Trading', 'Invoice No: 10136161', 'Date: 19.09.2026', 'ATTA VERMICELLI 45 pcs 4915238934478', 'BOURNVITA 12 4915238934479', 'GINGER BEER 24', 'MYSTERY LINE 4915238934480', 'ZZ TEST ITEM ALPHA 12 pcs 1.50', 'RICE 4915238934481 7 kg 3.20 22.40', 'PHONE 004915238934478999', 'Total Amount 1240.00'].join('\n');
  const parsed = parseInvoiceTextLines(sample);
  const q = (d: string) => parsed.rows.find((r) => r.rawDescription === d);
  ok(q('ATTA VERMICELLI')?.quantity === 45 && q('ATTA VERMICELLI')?.rawProductCode === '4915238934478', 'the failing shape ("… 45 pcs 4915238934478") reads quantity 45 and keeps the barcode as the product CODE (it used to read 4915238934478 as the quantity)');
  ok(q('BOURNVITA')?.quantity === 12 && q('BOURNVITA')?.rawProductCode === '4915238934479', 'a trailing barcode after a plain quantity is also taken as the code');
  ok(q('ZZ TEST ITEM ALPHA')?.quantity === 12 && q('ZZ TEST ITEM ALPHA')?.unit === 'pcs', 'the quantity is the number next to the unit, not the price after it ("12 pcs 1.50" reads 12)');
  ok(q('RICE')?.quantity === 7 && q('RICE')?.unit === 'kg', '...even with a barcode, a unit and two price columns');
  ok(!parsed.rows.some((r) => r.quantity > 1_000_000) && parsed.rows.every((r) => Number.isInteger(r.quantity) && r.quantity >= 1), 'no row can carry a quantity outside 1..1,000,000');
  ok(parsed.issues.some((i) => i.includes('MYSTERY LINE') && i.includes('barcode')), 'a line with a barcode but no quantity is REPORTED as skipped, not silently dropped');
  ok(parsed.issues.some((i) => i.includes('PHONE') && i.includes('not plausible')), 'an implausible number is REPORTED as skipped with the reason');
  ok(parsed.header.invoiceNumber === '10136161' && parsed.header.supplierName === 'Alibaba Trading', 'header fields still parse');

  const admin = new PrismaClient({ datasourceUrl: BASE_URL });
  const dbName = `invflow_${Date.now()}`;
  let server: ChildProcess | undefined;
  let serverLog = '';
  let prisma: PrismaClient | undefined;
  let redisUp = false;
  let crashed = false;

  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
    const dbUrl = urlFor(dbName);
    if (sh('npx', ['prisma', 'migrate', 'deploy'], { DATABASE_URL: dbUrl }).status !== 0) throw new Error('migrate deploy failed');
    const run = spawnSync('docker', ['run', '-d', '--rm', '--name', REDIS_NAME, '-p', `${REDIS_PORT}:6379`, 'redis:7-alpine'], { encoding: 'utf8' });
    if (run.status !== 0) throw new Error('could not start scratch redis: ' + run.stderr);
    redisUp = true;
    for (let i = 0; i < 30; i++) { if (spawnSync('docker', ['exec', REDIS_NAME, 'redis-cli', 'ping'], { encoding: 'utf8' }).stdout.includes('PONG')) break; await new Promise((r) => setTimeout(r, 300)); }
    const OWNER = 'owner@invtest-company.io';
    const OWNER_PW = 'Zebra-Quartz-Meadow-2026x';
    const boot = sh('npx', ['tsx', 'prisma/bootstrap-admin.ts'], { DATABASE_URL: dbUrl, ADMIN_EMAIL: OWNER, ADMIN_NAME: 'Test Owner', ADMIN_PASSWORD: OWNER_PW, BOOTSTRAP_CONFIRM_DB: dbName });
    if (boot.status !== 0) throw new Error('bootstrap failed: ' + boot.stdout + boot.stderr);
    server = spawn('node', ['dist/main.js'], {
      cwd: API_DIR,
      env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', DATABASE_URL: dbUrl, PORT: String(PORT), NODE_ENV: 'production', JWT_SECRET,
             REDIS_HOST: '127.0.0.1', REDIS_PORT: String(REDIS_PORT), REDIS_PASSWORD: '', CORS_ORIGIN: 'http://localhost', TRUST_PROXY: '127.0.0.1', OCR_SERVICE_URL: OCR_MODE === 'real' ? OCR_URL : `http://127.0.0.1:${STUB_PORT}` },
    });
    server.stdout!.on('data', (d) => (serverLog += d));
    server.stderr!.on('data', (d) => (serverLog += d));
    for (let i = 0; i < 60; i++) { try { if ((await fetch(`${API}/health`)).ok) break; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 500)); }
    prisma = new PrismaClient({ datasourceUrl: dbUrl });

    const tok: string = (await call('POST', '/auth/login', { body: { email: OWNER, password: OWNER_PW } })).data.accessToken;
    const wh = (await call('POST', '/locations', { token: tok, body: { name: 'Inv Warehouse', type: 'WAREHOUSE' } })).data.id as string;
    const mkProduct = async (sku: string, name: string, barcode?: string) => (await call('POST', '/products', { token: tok, body: { sku, name, category: 'General', unit: 'pcs', unitPrice: 1, ...(barcode ? { barcode } : {}) } })).data.id as string;
    const pAtta = await mkProduct('ATTA-1', 'ATTA VERMICELLI', '4915238934478');
    const pBourn = await mkProduct('BOURN-1', 'BOURNVITA');
    const pGinger = await mkProduct('GINGER-1', 'GINGER BEER');
    const onHand = async (productId: string) => (await prisma!.inventoryItem.findUnique({ where: { locationId_productId: { locationId: wh, productId } } }))?.onHand ?? 0;
    const movements = () => prisma!.inventoryMovement.count({ where: { type: 'RECEIPT' } });

    // ================= B. the invoice that used to fail =================
    console.log('\n== B. upload: a text-layer PDF whose lines carry barcodes (the production failure) ==');
    const pdf = textPdf(['Alibaba Trading', 'Invoice No: 10136161', 'Date: 19.09.2026', 'ATTA VERMICELLI 45 pcs 4915238934478', 'BOURNVITA 12 4915238934479', 'GINGER BEER 24', 'MYSTERY LINE 4915238934480', 'Total Amount 1240.00']);
    const before = await movements();
    const up = await upload(tok, { name: 'Invoice nr. 10136161.PDF.pdf', type: 'application/pdf', data: pdf }, { supplierName: 'alibaba', invoiceNumber: '10136161' });
    ok(up.status === 201, `the upload SUCCEEDS (201) instead of "Internal server error" (${up.status})`);
    const inv = up.data;
    ok(inv.status === 'UNDER_REVIEW' && /^INV-/.test(inv.code) && inv.supplierName === 'alibaba' && inv.invoiceNumber === '10136161', 'an invoice record is created, UNDER_REVIEW, with the entered supplier and number');
    const rows = (inv.items as any[]).map((i) => `${i.rawDescription}:${i.invoiceQty}`).sort();
    ok(JSON.stringify(rows) === JSON.stringify(['ATTA VERMICELLI:45', 'BOURNVITA:12', 'GINGER BEER:24']), `the review screen gets the three real rows with the right quantities (${rows.join(', ')})`);
    ok(inv.items.every((i: any) => i.receivedQty === i.invoiceQty && i.needsReview === true), 'each row is pre-filled for review and flagged "needs review" (PDF-sourced rows are never auto-trusted)');
    ok(inv.items.find((i: any) => i.rawDescription === 'ATTA VERMICELLI').productId === pAtta && inv.items.find((i: any) => i.rawDescription === 'ATTA VERMICELLI').rawProductCode === '4915238934478', 'the barcode on the line matched the product by barcode');
    ok(Array.isArray(inv.warnings) && inv.warnings.some((w: string) => w.includes('MYSTERY LINE') && w.includes('barcode')), 'the skipped line is reported back in `warnings` (so the UI can show it), not dropped silently');
    ok(inv.warnings.some((w: string) => /text layer/i.test(w)) && !/ocr/i.test(inv.warnings.join(' ').replace(/no usable/gi, '')), 'a text-layer PDF is read from its text layer (OCR is not needed or called)');
    ok((await movements()) === before && (await onHand(pAtta)) === 0 && (await onHand(pBourn)) === 0, 'UPLOADING DOES NOT CHANGE INVENTORY (no movement, on-hand still 0)');

    console.log('\n== C. review: edit, then confirm exactly once ==');
    const itemOf = (d: string) => inv.items.find((i: any) => i.rawDescription === d);
    const noConfirm = await call('POST', `/supplier-invoices/${inv.id}/confirm`, { token: tok });
    ok(noConfirm.status === 409 && /needs review|not been matched/i.test(noConfirm.data.message), 'confirming before the rows are reviewed is refused (409, with a clear reason)');
    ok((await movements()) === before, '...and adds no stock');
    const bad1 = await call('PATCH', `/supplier-invoices/${inv.id}/items/${itemOf('ATTA VERMICELLI').id}`, { token: tok, body: { receivedQty: 4915238934478 } });
    ok(bad1.status === 400 && /1000000|must not be greater/i.test(JSON.stringify(bad1.data)), 'editing a row to an impossible quantity is a clear 400 (it used to be a 500)');
    ok((await call('PATCH', `/supplier-invoices/${inv.id}/items/${itemOf('ATTA VERMICELLI').id}`, { token: tok, body: { receivedQty: -3 } })).status === 400, '...and a negative quantity is refused');
    const ed = await call('PATCH', `/supplier-invoices/${inv.id}/items/${itemOf('ATTA VERMICELLI').id}`, { token: tok, body: { productId: pAtta, receivedQty: 40 } });
    ok(ed.status === 200 && ed.data.receivedQty === 40 && ed.data.needsReview === false, 'editing a row works: received quantity 45 -> 40, and reviewing it clears the flag');
    for (const [d, pid] of [['BOURNVITA', pBourn], ['GINGER BEER', pGinger]] as const) await call('PATCH', `/supplier-invoices/${inv.id}/items/${itemOf(d).id}`, { token: tok, body: { productId: pid } });
    const c1 = await call('POST', `/supplier-invoices/${inv.id}/confirm`, { token: tok });
    ok(c1.status === 201 && c1.data.status === 'CONFIRMED', 'confirming once succeeds');
    ok((await onHand(pAtta)) === 40 && (await onHand(pBourn)) === 12 && (await onHand(pGinger)) === 24, 'stock increased by the RECEIVED (edited) quantities: 40 / 12 / 24');
    const mv = await prisma.inventoryMovement.findMany({ where: { type: 'RECEIPT', reference: inv.code } });
    ok(mv.length === 3 && mv.reduce((n, m) => n + m.quantity, 0) === 76, 'exactly three RECEIPT movements reference the invoice code (total 76)');
    const c2 = await call('POST', `/supplier-invoices/${inv.id}/confirm`, { token: tok });
    ok(c2.status === 409, 'confirming the SAME invoice again is rejected (409)');
    const both = await Promise.all([1, 2, 3, 4].map(() => call('POST', `/supplier-invoices/${inv.id}/confirm`, { token: tok })));
    ok(both.every((r) => r.status === 409) && (await movements()) === before + 3 && (await onHand(pAtta)) === 40, '...including four simultaneous attempts: stock is unchanged');
    ok((await call('POST', `/supplier-invoices/${inv.id}/cancel`, { token: tok })).status === 409, 'a confirmed invoice cannot be cancelled');

    console.log('\n== D. cancel creates no stock ==');
    const up2 = await upload(tok, { name: 'second.pdf', type: 'application/pdf', data: textPdf(['Alibaba Trading', 'Invoice No: 10136162', 'GINGER BEER 30 pcs 4915238934000']) }, { supplierName: 'alibaba', invoiceNumber: '10136162' });
    const mvBefore = await movements();
    const cn = await call('POST', `/supplier-invoices/${up2.data.id}/cancel`, { token: tok });
    ok(up2.status === 201 && cn.status === 201 && cn.data.status === 'CANCELLED' && (await movements()) === mvBefore && (await onHand(pGinger)) === 24, 'cancelling an uploaded invoice creates no stock');
    ok((await call('POST', `/supplier-invoices/${up2.data.id}/confirm`, { token: tok })).status === 409, '...and it can no longer be confirmed');

    // ================= E. other invoice fixtures + clear errors =================
    console.log('\n== E. other file types, and clear errors instead of "Internal server error" ==');
    const csvOk = await upload(tok, { name: 'invoice.csv', type: 'text/csv', data: Buffer.from('Description,Code,Qty\nBOURNVITA,BOURN-1,10\nGINGER BEER,GINGER-1,5\n') }, { supplierName: 'CSV Supplier', invoiceNumber: 'CSV-1' });
    ok(csvOk.status === 201 && csvOk.data.items.length === 2 && csvOk.data.items.every((i: any) => i.matchConfidence === 'exact'), 'a normal CSV invoice uploads and matches products by SKU');
    const csvBarcodeQty = await upload(tok, { name: 'bad-qty.csv', type: 'text/csv', data: Buffer.from('Description,Code,Qty\nBOURNVITA,BOURN-1,10\nGINGER BEER,GINGER-1,4915238934478\n') }, { supplierName: 'CSV Supplier', invoiceNumber: 'CSV-2' });
    ok(csvBarcodeQty.status === 201 && csvBarcodeQty.data.items.length === 1 && csvBarcodeQty.data.warnings.some((w: string) => w.includes('GINGER BEER') && w.includes('not plausible')), 'a CSV row whose "quantity" is a barcode is skipped WITH a visible warning; the good row still uploads (used to be a 500)');
    const csvAllBad = await upload(tok, { name: 'all-bad.csv', type: 'text/csv', data: Buffer.from('Description,Qty\nGINGER BEER,4915238934478\n') }, { supplierName: 'CSV Supplier', invoiceNumber: 'CSV-3' });
    ok(csvAllBad.status === 409 && /No product rows/.test(csvAllBad.data.message) && /not plausible/.test(csvAllBad.data.message), 'when NO row is usable, the 409 message says why (the skipped rows and the reason)');
    const csvNoCol = await upload(tok, { name: 'nocols.csv', type: 'text/csv', data: Buffer.from('Foo,Bar\n1,2\n') }, { supplierName: 'CSV Supplier', invoiceNumber: 'CSV-4' });
    ok(csvNoCol.status === 422 && /Could not find/.test(csvNoCol.data.message), 'a file without a description/quantity column is a 422 that names the missing columns (it used to be "Internal server error")');
    const corrupt = await upload(tok, { name: 'broken.pdf', type: 'application/pdf', data: Buffer.from('this is not really a pdf') }, { supplierName: 'PDF Supplier', invoiceNumber: 'PDF-1' });
    ok(corrupt.status === 422 && /could not be read/i.test(corrupt.data.message) && !/internal server error/i.test(corrupt.raw), 'a corrupt PDF is a clear 422 ("could not be read"), and the full error is logged server-side');
    ok(/Could not parse "broken.pdf"/.test(serverLog), '...the real exception is in the server log for diagnosis (not hidden)');
    const noFile = await upload(tok, null, { supplierName: 'X', invoiceNumber: 'Y' });
    ok(noFile.status === 400 && /Choose a file/.test(noFile.data.message), 'no file selected: a clear 400');
    const wrongType = await upload(tok, { name: 'notes.txt', type: 'text/plain', data: Buffer.from('hello') }, { supplierName: 'X', invoiceNumber: 'Y' });
    ok(wrongType.status === 409 && /Unsupported file type/.test(wrongType.data.message), 'an unsupported type is a clear 409');
    const noFields = await upload(tok, { name: 'invoice.csv', type: 'text/csv', data: Buffer.from('Description,Qty\nA,1\n') }, {});
    ok(noFields.status === 400 && /supplierName|invoiceNumber/.test(JSON.stringify(noFields.data)), 'missing supplier/invoice number: a 400 naming the fields');
    ok((await call('POST', '/inventory/adjustments', { token: tok, body: { locationId: wh, productId: pAtta, quantity: 4915238934478, reason: 'MANUAL_CORRECTION' } })).status === 400, 'the same class of failure elsewhere (stock adjustment with an impossible number) is now a clear 400');

    // ================= F. OCR =================
    console.log(`\n== F. scanned (image-only) PDF -> OCR fallback (${OCR_MODE === 'real' ? 'REAL OCR service' : 'STUBBED OCR service replaying recorded PaddleOCR output'}) ==`);
    const stubState = { fail: false };
    const stub = OCR_MODE === 'stub' ? startOcrStub(stubState) : null;
    const imageOnly = textPdf([]); // a page with no text at all, like a scan: the text layer is empty so OCR must be used
    if (OCR_MODE === 'stub') {
      const scanned = await upload(tok, { name: 'scanned.pdf', type: 'application/pdf', data: imageOnly }, { supplierName: 'Fresh Tropical S.r.l.', invoiceNumber: '10136161' });
      ok(scanned.status === 201 && scanned.data.status === 'UNDER_REVIEW', 'an image-only PDF uploads (201, UNDER_REVIEW) via the OCR fallback');
      ok(stub!.calls() === 1, 'the OCR service was called exactly once (and only because the text layer was empty)');
      ok(scanned.data.warnings.some((w: string) => /read with OCR \(PaddleOCR\)/.test(w) && /99%|100%/.test(w)), 'the response says the file was read with OCR, with its confidence, and must be verified');
      const sr = (scanned.data.items as any[]).map((i) => `${i.rawDescription}:${i.invoiceQty}`);
      ok(sr.length === 9 && sr.includes('ATTA VERMICELLI APNABABA:45') && sr.includes('INDOMIE NOODLES:40') && sr.includes('BOURNVITA:12'), `OCR text becomes the nine product rows with the right quantities (${sr.length} rows)`);
      ok(scanned.data.items.every((i: any) => i.needsReview === true) && (await movements()) === before + 3, 'OCR-sourced rows are all flagged for review and uploading added no stock');
      stubState.fail = true;
      const invCountBefore = await prisma.supplierInvoice.count();
      const ocrDown = await upload(tok, { name: 'scanned2.pdf', type: 'application/pdf', data: imageOnly }, { supplierName: 'Fresh Tropical S.r.l.', invoiceNumber: '10136162' });
      ok(ocrDown.status === 409 && /OCR service could not process/.test(ocrDown.data.message) && !/internal server error/i.test(ocrDown.raw), 'when the OCR service fails, the manager gets a clear 409 ("OCR could not process it right now: retry or export CSV/XLSX")');
      ok((await prisma.supplierInvoice.count()) === invCountBefore, '...and no half-created invoice is left behind');
      stub!.server.close();
      skip('REAL PaddleOCR was NOT exercised in this run (OCR_MODE=stub). Production verified real OCR on 2026-09-25 with a different fixture; run with OCR_MODE=real against a native x86_64 OCR container to test it here');
    } else {
      let ocrUp = false;
      try { ocrUp = (await fetch(`${OCR_URL}/health`, { signal: AbortSignal.timeout(4000) })).ok; } catch { /* not reachable */ }
      if (!ocrUp || !existsSync(OCR_FIXTURE)) { fail++; console.log(`✗ FAIL: OCR_MODE=real but the OCR service (${OCR_URL}) or the fixture (${OCR_FIXTURE}) is not available`); }
      else {
        const t0 = Date.now();
        const scanned = await upload(tok, { name: 'scanned.pdf', type: 'application/pdf', data: readFileSync(OCR_FIXTURE) }, { supplierName: 'ZZ TEST SUPPLIER LTD', invoiceNumber: 'ZZTEST-0001' }, 600_000);
        ok(scanned.status === 201 && scanned.data.warnings.some((w: string) => /read with OCR/.test(w)), `a real scanned PDF uploads via the real OCR service (${Math.round((Date.now() - t0) / 1000)}s)`);
        const sr = (scanned.data.items as any[]).map((i) => `${i.rawDescription}:${i.invoiceQty}`);
        ok(sr.some((r) => /ALPHA:12$/.test(r)) && sr.some((r) => /BRAVO:6$/.test(r)) && sr.some((r) => /CHARLIE:24$/.test(r)), `rows read with quantities 12 / 6 / 24 (${sr.join(', ')})`);
      }
    }

    // ================= G. hygiene =================
    console.log('\n== G. no server errors ==');
    ok(!statuses.some((s) => s >= 500), `none of the ${statuses.length} requests in this run returned a 5xx`);
    ok(!/Unable to fit integer/.test(serverLog), 'and the INT4 overflow no longer appears in the server log');
  } catch (err) {
    crashed = true;
    console.error('CRASHED:', err);
  } finally {
    if (server) server.kill('SIGTERM');
    if (prisma) await prisma.$disconnect();
    await new Promise((r) => setTimeout(r, 500));
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`).catch(() => {});
    await admin.$disconnect();
    console.log(`\n${crashed ? '❌ The test crashed.' : fail === 0 ? '✅ All checks passed.' : `❌ ${fail} check(s) failed.`} (${pass} passed, ${fail} failed, ${skipped} skipped)`);
    if (redisUp) spawnSync('docker', ['rm', '-f', REDIS_NAME]);
    process.exit(fail === 0 && !crashed ? 0 : 1);
  }
}

main().catch((err) => {
  console.error('CRASHED:', err);
  process.exit(1);
});
