/**
 * Reader for the columnar invoice layout used by the Italian wholesaler Fresh Tropical (invoices printed by their
 * ERP): one line per product, then a second line with the batch and best-before date, e.g.
 *
 *   4996 GINGER BEER 24x330ML IT CAR 15 24,000 0,000 360,000 0,56 201,60 41%
 *   Cod.Int.: 171975 L/Data: 03.09.2027
 *
 * Columns after the description and origin: unit of measure (CAR/CNF/PC), CARTONS, PACK SIZE (units per carton),
 * a second quantity column that is always zero, TOTAL UNITS, PRICE, AMOUNT, VAT %. Free-of-charge goods appear as an extra
 * row for the same product with price 0,00 and amount 0,00; their quantity is real stock and must not be dropped.
 *
 * Deliberately conservative: it only ever claims a document when the batch/expiry lines and product rows are both present,
 * and every row's own arithmetic is checked (cartons x pack size = units; price x quantity = amount). Anything that does not
 * add up is still returned, but flagged `suspect` and reported in `issues`, never silently corrected.
 *
 * Not used for CSV/Excel. Pure text in, rows out; it never touches the database.
 */
import type { ParsedInvoiceHeader, ParsedInvoiceRow } from './types';

const NUM = String.raw`\d{1,3}(?:\.\d{3})*,\d+|\d+,\d+|\d+`; // Italian number format: 1.234,56
const ROW = new RegExp(
  String.raw`^(\d{1,8})\s+(.+?)\s+([A-Z]{2})\s+(CAR|CNF|PC)\s+(\d+)\s+(${NUM})\s+(${NUM})\s+(${NUM})\s+(${NUM})\s+(${NUM})\s+(\d{1,2})%$`,
);
const BATCH = /^Cod\.Int\.:\s*(\S+).*?L\/Data:\s*(\d{2})\.(\d{2})\.(\d{4})/;
const AMOUNT = /\d{1,3}(?:\.\d{3})*,\d{2}/g;
const UNIT_LABEL: Record<string, string> = { CAR: 'carton', CNF: 'pack', PC: 'piece' };

/** "1.234,56" -> 1234.56 */
export function parseItalianNumber(s: string): number {
  return Number(s.replace(/\./g, '').replace(',', '.'));
}
const cents = (n: number) => Math.round(n * 100);

export interface ColumnarResult {
  header: ParsedInvoiceHeader;
  rows: ParsedInvoiceRow[];
  issues: string[];
}

/** Returns null when this text is not in that layout, so the caller falls back to the generic heuristic. */
export function parseColumnarInvoice(text: string): ColumnarResult | null {
  const lines = text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

  const rows: ParsedInvoiceRow[] = [];
  const issues: string[] = [];
  let batchLines = 0;
  let pending: ParsedInvoiceRow | null = null; // the most recent row still waiting for its batch/expiry line (it can land on the next page)

  for (const line of lines) {
    const m = ROW.exec(line);
    if (m) {
      if (pending) issues.push(`"${pending.rawDescription}" has no batch/expiry line`);
      const [, code, description, , um, cartonsStr, packStr, , unitsStr, priceStr, amountStr] = m;
      const cartons = Number(cartonsStr);
      const packSize = parseItalianNumber(packStr);
      const totalUnits = parseItalianNumber(unitsStr);
      const price = parseItalianNumber(priceStr);
      const amount = parseItalianNumber(amountStr);
      const isFree = cents(price) === 0 && cents(amount) === 0;

      let suspect = false;
      if (!Number.isInteger(packSize) || packSize < 1 || cartons < 1 || cartons * packSize !== totalUnits) {
        suspect = true;
        issues.push(`Line "${code} ${description}": ${cartons} x ${packStr} does not equal the printed ${unitsStr} units: check it by hand`);
      }
      // Which quantity was the price applied to? Both are seen on the same invoice (most lines per individual unit, a few per carton).
      let priceBasis: 'CARTON' | 'UNIT' | undefined;
      if (!isFree) {
        if (Math.abs(totalUnits * price - amount) < 0.011) priceBasis = 'UNIT';
        else if (Math.abs(cartons * price - amount) < 0.011) priceBasis = 'CARTON';
        else {
          suspect = true;
          issues.push(`Line "${code} ${description}": the price ${priceStr} does not multiply out to the amount ${amountStr}: check it by hand`);
        }
      }

      const row: ParsedInvoiceRow = {
        rawDescription: description.trim(),
        rawProductCode: code,
        unit: UNIT_LABEL[um],
        quantity: cartons,
        packSize: Number.isInteger(packSize) ? packSize : undefined,
        totalUnits: Number.isInteger(totalUnits) ? totalUnits : undefined,
        unitPrice: price,
        priceBasis,
        lineAmount: amount,
        isFree,
        suspect,
      };
      rows.push(row);
      pending = row;
      continue;
    }

    const b = BATCH.exec(line);
    if (b) {
      batchLines++;
      if (!pending) {
        issues.push(`A batch/expiry line ("${line.slice(0, 60)}") has no product line before it: ignored`);
        continue;
      }
      const [, batch, dd, mm, yyyy] = b;
      const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
      if (Number.isNaN(d.getTime()) || d.getUTCDate() !== Number(dd)) {
        issues.push(`"${pending.rawDescription}": the best-before date ${dd}.${mm}.${yyyy} is not a real date`);
        pending.suspect = true;
      } else {
        pending.expiryDate = d;
      }
      pending.batchNumber = batch;
      pending = null;
    }
  }
  if (pending) issues.push(`"${pending.rawDescription}" has no batch/expiry line`);

  // Only claim the document when both kinds of line are there; otherwise leave it to the generic reader.
  if (rows.length === 0 || batchLines === 0) return null;

  return { header: readHeader(lines), rows, issues };
}

function readHeader(lines: string[]): ParsedInvoiceHeader {
  const header: ParsedInvoiceHeader = {};
  // "INVOICE" / <number> / <dd.mm.yyyy> at the top of each page.
  const at = lines.findIndex((l) => /^INVOICE$/i.test(l));
  if (at >= 0) {
    if (/^\d{4,}$/.test(lines[at + 1] ?? '')) header.invoiceNumber = lines[at + 1];
    const d = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(lines[at + 2] ?? '');
    if (d) header.invoiceDate = new Date(Date.UTC(Number(d[3]), Number(d[2]) - 1, Number(d[1])));
  }
  // The payable total sits on the "Payment: Up to <date> <amount>" line (last amount on it).
  const pay = lines.find((l) => /Payment:/i.test(l));
  const amounts = pay?.match(AMOUNT);
  if (amounts?.length) header.invoiceTotal = parseItalianNumber(amounts[amounts.length - 1]);
  if (lines.some((l) => /\bEUR\b/.test(l))) header.currency = 'EUR';
  return header;
}
