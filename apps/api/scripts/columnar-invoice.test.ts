/**
 * Unit tests for the columnar invoice reader (no database, no network). Uses a synthetic fixture; if REAL_INVOICE_PDF points at the
 * real supplier PDF it is also checked (kept out of the repository because it is a customer document).
 * Run with: npm run test:columnar-invoice
 */
import { readFileSync } from 'node:fs';
import { PDFParse } from 'pdf-parse';
import { parseColumnarInvoice, parseItalianNumber } from '../src/supplier-invoices/parsers/columnar-invoice';
import { parseInvoiceTextLines } from '../src/supplier-invoices/parsers/text-row-parser';
import { fixtureText, ROW_LINES, BATCH, HEADER_LINES } from './columnar-fixture';

let pass = 0, fail = 0, skipped = 0;
const ok = (c: boolean, l: string) => { if (c) { pass++; console.log(`✓ ${l}`); } else { fail++; console.log(`✗ FAIL: ${l}`); } };
const day = (d?: Date) => d?.toISOString().slice(0, 10);

async function main() {
  console.log('== number format ==');
  ok(parseItalianNumber('1.234,56') === 1234.56 && parseItalianNumber('4.000,000') === 4000 && parseItalianNumber('0,00') === 0 && parseItalianNumber('15') === 15, 'Italian numbers (1.234,56 / 4.000,000 / 0,00) parse correctly');

  console.log('\n== synthetic invoice: header ==');
  const r = parseColumnarInvoice(fixtureText())!;
  ok(!!r, 'the layout is recognised');
  ok(r.header.invoiceNumber === '90000001' && day(r.header.invoiceDate) === '2026-09-19' && r.header.invoiceTotal === 341.36 && r.header.currency === 'EUR', 'invoice number, date, total and currency are read from the document');
  ok(r.issues.length === 0, `a clean invoice produces no issues (${r.issues.join(' | ')})`);

  console.log('\n== synthetic invoice: rows ==');
  ok(r.rows.length === 6, `6 lines read (paid + free ginger beer, noodles, spice, sauce, promo): got ${r.rows.length}`);
  const [paid, free, noodles, spice, sauce, promo] = r.rows;
  ok(paid.rawProductCode === '1001' && paid.rawDescription === 'TEST GINGER BEER 24x330ML' && paid.unit === 'carton', 'product code and description are split from the origin and unit-of-measure columns');
  ok(paid.quantity === 15 && paid.packSize === 24 && paid.totalUnits === 360, 'paid line: 15 cartons x 24 = 360 units, all three values kept');
  ok(paid.unitPrice === 0.56 && paid.priceBasis === 'UNIT' && paid.lineAmount === 201.6 && paid.isFree === false, 'paid line: price 0.56 is per individual UNIT, amount 201.60');
  ok(paid.batchNumber === '900001' && day(paid.expiryDate) === '2027-09-03', 'batch number and expiry date are read from the line beneath');
  ok(free.isFree === true && free.quantity === 3 && free.totalUnits === 72 && free.lineAmount === 0 && free.priceBasis === undefined, 'free-of-charge line keeps its quantity (3 cartons = 72 units), price 0, no price basis');
  ok(free.batchNumber === '900001' && day(free.expiryDate) === '2027-09-03', 'the free line has its own batch/expiry');
  ok(paid.quantity + free.quantity === 18 && paid.totalUnits! + free.totalUnits! === 432, 'paid + free = 18 cartons = 432 units');
  ok(noodles.priceBasis === 'CARTON' && noodles.unitPrice === 11.44 && noodles.lineAmount === 57.2, 'a line priced per CARTON (5 x 11.44 = 57.20) is recognised as such');
  ok(spice.unit === 'pack' && promo.unit === 'piece' && promo.quantity === 2 && promo.packSize === 1, 'CNF -> pack, PC -> piece');
  ok(sauce.batchNumber === '900004' && day(sauce.expiryDate) === '2028-05-30', 'a batch line at the top of the next page is attached to the last line of the previous page');
  ok(day(promo.expiryDate) === '2035-12-31' && promo.isFree === true, 'the free promo line is kept with its expiry');
  const sum = Math.round(r.rows.reduce((a, x) => a + Math.round(x.lineAmount! * 100), 0)) / 100;
  ok(sum === 341.36 && sum === r.header.invoiceTotal, 'the line amounts add up to the invoice total (341.36)');
  ok(r.rows.reduce((a, x) => a + x.quantity, 0) === 32 && r.rows.reduce((a, x) => a + x.totalUnits!, 0) === 694, 'totals: 32 cartons, 694 units');
  ok(r.rows.every((x) => !x.suspect), 'no row is flagged suspect');

  console.log('\n== things that do not add up are flagged, never silently fixed ==');
  const bad = (from: string, to: string) => parseColumnarInvoice(fixtureText().replace(from, to))!;
  let x = bad(ROW_LINES.gingerPaid, '1001 TEST GINGER BEER 24x330ML IT CAR 15 24,000 0,000 350,000 0,56 196,00 41%');
  ok(x.rows[0].suspect === true && x.rows[0].quantity === 15 && x.issues.some((i) => /does not equal the printed 350,000 units/.test(i)), 'cartons x pack size != printed units: row kept as printed, flagged suspect, reported');
  x = bad(ROW_LINES.gingerPaid, '1001 TEST GINGER BEER 24x330ML IT CAR 15 24,000 0,000 360,000 0,56 999,99 41%');
  ok(x.rows[0].suspect === true && x.rows[0].priceBasis === undefined && x.issues.some((i) => /does not multiply out/.test(i)), 'price x quantity != amount: flagged suspect, price basis left unknown');
  x = bad(ROW_LINES.gingerFree, '1001 TEST GINGER BEER 24x330ML IT CAR 3 24,000 0,000 72,000 0,00 5,00 41%');
  ok(x.rows[1].suspect === true && x.rows[1].isFree === false && x.issues.some((i) => /does not multiply out/.test(i)), 'a zero price with a non-zero amount is not treated as free: flagged suspect');
  x = bad(BATCH('900002', '01.12.2026'), BATCH('900002', '31.02.2027'));
  ok(x.rows[2].suspect === true && x.rows[2].expiryDate === undefined && x.issues.some((i) => /not a real date/.test(i)), 'an impossible best-before date is flagged, not stored');
  x = parseColumnarInvoice(fixtureText().replace(BATCH('900003', '25.11.2027') + '\n', ''))!;
  ok(x.issues.some((i) => /TEST SPICE MIX.*no batch\/expiry line/.test(i)) && x.rows[3].batchNumber === undefined, 'a product line with no batch/expiry line is reported');

  console.log('\n== documents that are not this layout fall back to the generic reader ==');
  ok(parseColumnarInvoice('') === null, 'empty text is not claimed');
  ok(parseColumnarInvoice(['Invoice No: 77', 'RICE 5 kg 3', 'LENTILS 2 kg 4'].join('\n')) === null, 'a simple generic invoice is not claimed');
  ok(parseColumnarInvoice(HEADER_LINES.join('\n') + '\n' + ROW_LINES.gingerPaid) === null, 'product lines without any batch/expiry line are not claimed (too risky to trust)');
  ok(parseInvoiceTextLines(['Alibaba Trading', 'Invoice No: 10136161', 'ATTA VERMICELLI 45 pcs'].join('\n')).rows.length === 1, 'the generic reader is unchanged');

  console.log('\n== the real supplier PDF (optional: REAL_INVOICE_PDF) ==');
  const realPath = process.env.REAL_INVOICE_PDF;
  if (!realPath) { skipped++; console.log('- SKIPPED: set REAL_INVOICE_PDF to the real invoice to check it'); }
  else {
    const p = new PDFParse({ data: new Uint8Array(readFileSync(realPath)) });
    const text = (await p.getText()).text; await p.destroy();
    const real = parseColumnarInvoice(text)!;
    ok(!!real, 'REAL: the real invoice is recognised');
    ok(real.header.invoiceNumber === '10136161' && day(real.header.invoiceDate) === '2026-09-19' && real.header.invoiceTotal === 4300.36 && real.header.currency === 'EUR', 'REAL: invoice number 10136161, date 2026-09-19, total 4300.36 EUR');
    ok(real.rows.length === 44 && real.rows.filter((x) => x.isFree).length === 13 && real.rows.filter((x) => !x.isFree).length === 31, 'REAL: 44 lines = 31 paid + 13 free-of-charge');
    const realSum = Math.round(real.rows.reduce((a, x) => a + Math.round(x.lineAmount! * 100), 0)) / 100;
    ok(realSum === 4300.36, `REAL: line amounts add up to exactly 4300.36 (${realSum})`);
    ok(real.rows.reduce((a, x) => a + x.quantity, 0) === 257 && real.rows.reduce((a, x) => a + x.totalUnits!, 0) === 6475, 'REAL: 257 cartons = 6,475 units (the footer says 257)');
    ok(real.rows.every((x) => x.batchNumber && x.expiryDate && x.packSize && x.totalUnits && x.rawProductCode), 'REAL: every line has code, pack size, units, batch number and expiry date');
    ok(real.rows.every((x) => !x.suspect) && real.issues.length === 0, 'REAL: no line flagged, no issues');
    ok(real.rows.filter((x) => x.priceBasis === 'CARTON').map((x) => x.rawProductCode).sort().join() === '10905,8695', 'REAL: exactly two lines are priced per carton (10905, 8695); all other paid lines per unit');
    const gb = real.rows.filter((x) => x.rawProductCode === '4996');
    ok(gb.length === 2 && gb.reduce((a, x) => a + x.quantity, 0) === 18 && gb.reduce((a, x) => a + x.totalUnits!, 0) === 432 && gb.some((x) => x.isFree && x.quantity === 3 && x.totalUnits === 72), 'REAL: Ginger Beer = 15 paid + 3 free = 18 cartons = 432 units');
    const poundo = real.rows.find((x) => x.rawProductCode === '6287');
    ok(poundo?.batchNumber === '185122' && day(poundo?.expiryDate) === '2028-05-30', 'REAL: the line at the bottom of page 1 gets the batch line from the top of page 2');
    ok(real.rows.filter((x) => x.isFree).every((x) => x.quantity > 0 && x.totalUnits! > 0), 'REAL: no free line lost its quantity');
  }

  console.log(`\n${fail === 0 ? '✅ All checks passed.' : `❌ ${fail} check(s) failed.`} (${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ''})`);
  process.exit(fail === 0 ? 0 : 1);
}
main();
