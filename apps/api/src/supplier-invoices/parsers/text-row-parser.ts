/**
 * The heuristic "turn a page of loose text into candidate invoice rows"
 * logic — shared by both text sources that ever feed it: pdf-parse's text
 * layer (machine-readable PDFs) and PaddleOCR's recognized text (scanned
 * PDFs, see ocr-client.service.ts). One parser, two possible sources —
 * "do not duplicate invoice parsing logic inside the OCR service" per the
 * spec; parsing always happens here, in Node, never in apps/ocr.
 */
import type { ParsedInvoiceHeader, ParsedInvoiceRow } from './types';
import { BARCODE_LIKE, checkQuantity } from './quantity';

const UNITS = 'kg|g|l|ml|pcs|pc|box|carton|unit|units|case';
// "<description> <qty> <unit>" followed by optional price/total columns ("12 pcs 1.50 18.00"): the quantity is the number
// that sits right next to a unit word, not the last number on the line (which is usually a price or line total).
const QTY_WITH_UNIT = new RegExp(`^(.*\\S)\\s+(\\d+(?:[.,]\\d+)?)\\s*(${UNITS})\\b(?:\\s+[€$£]?\\d+(?:[.,]\\d+)?)*\\s*$`, 'i');
const QTY_LINE = new RegExp(`^(.*\\S)\\s+(\\d+(?:[.,]\\d+)?)\\s*(${UNITS})?\\s*$`, 'i');
const SKIP_LINE = /^(total|subtotal|vat|tax|amount|date|invoice|page)\b/i;
const INVOICE_NO = /invoice\s*(?:no\.?|number|#)?\s*[:\-]?\s*([A-Za-z0-9\-/]+)/i;
const DATE_PATTERNS = [/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/];

function parseDate(text: string): Date | undefined {
  for (const pattern of DATE_PATTERNS) {
    const m = pattern.exec(text);
    if (m) {
      const [, d, mo, y] = m;
      const year = y.length === 2 ? Number(y) + 2000 : Number(y);
      const date = new Date(Date.UTC(year, Number(mo) - 1, Number(d)));
      if (!Number.isNaN(date.getTime())) return date;
    }
  }
  return undefined;
}

/**
 * `issues` lists every line that looked like a product row but was NOT turned into one (and why), so nothing is
 * dropped silently: they are returned to the manager alongside the rows that were read.
 */
export function parseInvoiceTextLines(text: string): { header: ParsedInvoiceHeader; rows: ParsedInvoiceRow[]; issues: string[] } {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const rows: ParsedInvoiceRow[] = [];
  const issues: string[] = [];
  let supplierName: string | undefined = lines[0];
  let invoiceNumber: string | undefined;
  let invoiceDate: Date | undefined;

  for (const line of lines) {
    const invMatch = INVOICE_NO.exec(line);
    if (invMatch && !invoiceNumber) invoiceNumber = invMatch[1];
    if (!invoiceDate) invoiceDate = parseDate(line);

    // A barcode (EAN/UPC/GTIN) printed on the line is the product CODE, never the quantity: take it out first,
    // so the quantity is read from what remains and the code can help match the product.
    let work = line;
    let code: string | undefined;
    const bc = BARCODE_LIKE.exec(work);
    if (bc) {
      code = bc[0];
      work = `${work.slice(0, bc.index)} ${work.slice(bc.index + bc[0].length)}`.replace(/\s+/g, ' ').trim();
    }

    const m = QTY_WITH_UNIT.exec(work) ?? QTY_LINE.exec(work);
    if (!m) {
      if (code && /[A-Za-z]{3}/.test(work) && !SKIP_LINE.test(work)) {
        issues.push(`Line "${line.slice(0, 80)}": found the barcode ${code} but no readable quantity: skipped`);
      }
      continue;
    }
    const [, description, qtyStr, unit] = m;
    // Skip lines that are almost certainly not product rows: pure numbers,
    // totals/date-like lines, or a description too short to be meaningful.
    if (SKIP_LINE.test(description)) continue;
    if (description.length < 3) continue;
    const qty = Number(qtyStr.replace(',', '.'));
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const checked = checkQuantity(qty);
    if (!checked.ok) {
      issues.push(`Line "${line.slice(0, 80)}": ${checked.reason}: skipped`);
      continue;
    }

    rows.push({ rawDescription: description.trim(), rawProductCode: code, unit: unit?.toLowerCase(), quantity: checked.value });
  }

  return { header: { supplierName, invoiceNumber, invoiceDate }, rows, issues };
}
