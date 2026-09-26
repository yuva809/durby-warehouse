/**
 * One definition of "a quantity that can appear on a supplier invoice", shared by every parser
 * (PDF text / OCR text, CSV, Excel) and by the service's final check before the database.
 *
 * Why this exists: quantities are stored in 32-bit integer columns, and a text/OCR heuristic can easily
 * read a BARCODE (e.g. the 13-digit EAN 4915238934478) or an invoice/phone number as a quantity. That used
 * to reach the database and fail as an opaque "Internal server error". A quantity must be a whole number
 * from 1 to MAX_INVOICE_QTY; anything else is reported to the manager as a skipped line, never stored.
 */
import { MAX_QUANTITY } from '../../common/limits';

export const MAX_INVOICE_QTY = MAX_QUANTITY;

/** EAN-8 / UPC-A / EAN-13 / GTIN-14 style: 8 to 14 digits with no decimals. Never a plausible quantity. */
export const BARCODE_LIKE = /(?<![\d.,-])\d{8,14}(?!\d)(?![.,]\d)/;

export type QuantityCheck = { ok: true; value: number } | { ok: false; reason: string };

/** Accepts decimals from the source ("2,5" kg) by rounding, then requires a whole number in range. */
export function checkQuantity(raw: number): QuantityCheck {
  if (!Number.isFinite(raw)) return { ok: false, reason: 'the quantity is not a number' };
  const value = Math.round(raw);
  if (value < 1) return { ok: false, reason: 'the quantity is zero or negative' };
  if (value > MAX_INVOICE_QTY) {
    return { ok: false, reason: `a quantity of ${raw} is not plausible (the largest accepted is ${MAX_INVOICE_QTY.toLocaleString('en-US')}); it may be a barcode or invoice number read as a quantity` };
  }
  return { ok: true, value };
}
