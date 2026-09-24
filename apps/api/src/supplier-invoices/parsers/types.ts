/**
 * Format-agnostic contract every supplier-document parser implements
 * (CSV, XLSX/XLSM today; PDF is a best-effort text-layout parser — see
 * pdf.parser.ts). None of these ever touch inventory or the database; they
 * only turn file bytes into rows for SupplierInvoicesService to validate,
 * match, and stage for manager review. Adding a new source format (a
 * different accounting system's export, a future OCR/AI provider for
 * scanned invoices) means adding one more implementation of this interface,
 * not touching the review/confirm workflow at all.
 */
export interface ParsedInvoiceRow {
  rawDescription: string;
  rawProductCode?: string;
  unit?: string;
  /** Quantity as printed on the source document — never written to inventory directly. */
  quantity: number;
}

export interface ParsedInvoiceHeader {
  supplierName?: string;
  invoiceNumber?: string;
  invoiceDate?: Date;
}

export interface ParsedInvoice {
  header: ParsedInvoiceHeader;
  rows: ParsedInvoiceRow[];
  /** Human-readable notices about rows that were skipped or look off — surfaced to the manager on the review screen. */
  warnings: string[];
  /**
   * Whether every row should be forced into review regardless of how
   * confident the product match looks. Structured formats (CSV/XLSX) have
   * reliable columns, so match confidence alone is a fair review signal.
   * PDF text-layout extraction is a best-effort heuristic — even a row whose
   * product match is "exact" could still be a mis-split line, so PDF-sourced
   * rows are always forced into review independent of match confidence.
   */
  forceReview?: boolean;
}

export interface SupplierInvoiceParser {
  supports(mimeType: string, filename: string): boolean;
  parse(buffer: Buffer): Promise<ParsedInvoice>;
}
