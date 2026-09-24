/**
 * The heuristic "turn a page of loose text into candidate invoice rows"
 * logic — shared by both text sources that ever feed it: pdf-parse's text
 * layer (machine-readable PDFs) and PaddleOCR's recognized text (scanned
 * PDFs, see ocr-client.service.ts). One parser, two possible sources —
 * "do not duplicate invoice parsing logic inside the OCR service" per the
 * spec; parsing always happens here, in Node, never in apps/ocr.
 */
import type { ParsedInvoiceHeader, ParsedInvoiceRow } from './types';

const QTY_LINE = /^(.*\S)\s+(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|pcs|pc|box|carton|unit|units|case)?\s*$/i;
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

export function parseInvoiceTextLines(text: string): { header: ParsedInvoiceHeader; rows: ParsedInvoiceRow[] } {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const rows: ParsedInvoiceRow[] = [];
  let supplierName: string | undefined = lines[0];
  let invoiceNumber: string | undefined;
  let invoiceDate: Date | undefined;

  for (const line of lines) {
    const invMatch = INVOICE_NO.exec(line);
    if (invMatch && !invoiceNumber) invoiceNumber = invMatch[1];
    if (!invoiceDate) invoiceDate = parseDate(line);

    const m = QTY_LINE.exec(line);
    if (!m) continue;
    const [, description, qtyStr, unit] = m;
    // Skip lines that are almost certainly not product rows: pure numbers,
    // totals/date-like lines, or a description too short to be meaningful.
    if (/^(total|subtotal|vat|tax|amount|date|invoice|page)\b/i.test(description)) continue;
    if (description.length < 3) continue;
    const qty = Number(qtyStr.replace(',', '.'));
    if (!Number.isFinite(qty) || qty <= 0) continue;

    rows.push({ rawDescription: description.trim(), unit: unit?.toLowerCase(), quantity: Math.round(qty) });
  }

  return { header: { supplierName, invoiceNumber, invoiceDate }, rows };
}
