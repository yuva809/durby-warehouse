import { UnprocessableEntityException } from '@nestjs/common';
import type { ParsedInvoiceRow } from './types';
import { checkQuantity } from './quantity';

// Accepted header spellings per logical column, lowercase/trimmed. Covers
// the common variants real supplier exports use without hardcoding to any
// one supplier's exact wording — the "clean, format-agnostic" requirement
// from the spec.
const SYNONYMS: Record<'description' | 'code' | 'qty' | 'unit', string[]> = {
  description: ['description', 'product', 'item', 'item name', 'product name', 'name'],
  code: ['code', 'sku', 'article', 'article code', 'product code', 'item code'],
  qty: ['qty', 'quantity', 'invoice qty', 'ordered qty', 'amount'],
  unit: ['unit', 'uom', 'unit of measure', 'measure'],
};

export interface ColumnMapping {
  description: string;
  code?: string;
  qty: string;
  unit?: string;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Throws with a clear message (surfaced to the manager) if a required column can't be found. */
export function detectColumns(headers: string[]): ColumnMapping {
  const normalized = headers.map(normalizeHeader);
  const find = (candidates: string[]) => {
    const idx = normalized.findIndex((h) => candidates.includes(h));
    return idx === -1 ? undefined : headers[idx];
  };

  const description = find(SYNONYMS.description);
  const qty = find(SYNONYMS.qty);
  if (!description || !qty) {
    const missing = [!description && 'a product/description column', !qty && 'a quantity column'].filter(Boolean).join(' and ');
    throw new UnprocessableEntityException(
      `Could not find ${missing} in the uploaded file. Found columns: ${headers.join(', ') || '(none)'}. ` +
        `Expected something like "Description"/"Product" and "Qty"/"Quantity".`,
    );
  }
  return { description, qty, code: find(SYNONYMS.code), unit: find(SYNONYMS.unit) };
}

/** Turns one already-mapped record (object keyed by header) into a row, or null if it's a blank/invalid line (recorded as a warning by the caller). */
export function rowFromRecord(record: Record<string, unknown>, cols: ColumnMapping): { row: ParsedInvoiceRow | null; issue?: string } {
  const description = String(record[cols.description] ?? '').trim();
  if (!description) return { row: null }; // silently skip fully blank lines
  const qtyRaw = record[cols.qty];
  const qty = typeof qtyRaw === 'number' ? qtyRaw : Number(String(qtyRaw ?? '').replace(/,/g, '').trim());
  if (!Number.isFinite(qty) || qty <= 0) {
    return { row: null, issue: `Row "${description}": invalid or non-positive quantity ("${qtyRaw}") — skipped` };
  }
  const checked = checkQuantity(qty);
  if (!checked.ok) return { row: null, issue: `Row "${description}": ${checked.reason} ("${qtyRaw}"): skipped` };
  const code = cols.code ? String(record[cols.code] ?? '').trim() || undefined : undefined;
  const unit = cols.unit ? String(record[cols.unit] ?? '').trim() || undefined : undefined;
  return { row: { rawDescription: description, rawProductCode: code, unit, quantity: checked.value } };
}
