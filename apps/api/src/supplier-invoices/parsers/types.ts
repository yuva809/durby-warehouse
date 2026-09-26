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
  // Optional detail, only filled by layouts that print it (see columnar-invoice.ts). `quantity` is always in STOCK units (cartons).
  /** Individual units in one carton, and the total individual units on this line (quantity x packSize). */
  packSize?: number;
  totalUnits?: number;
  /** Price as printed and whether it is per carton or per individual unit; the printed line amount; free-of-charge line (price and amount both 0). */
  unitPrice?: number;
  priceBasis?: 'CARTON' | 'UNIT';
  lineAmount?: number;
  isFree?: boolean;
  batchNumber?: string;
  expiryDate?: Date;
  /** This row's own numbers did not add up (e.g. cartons x pack size != printed units), so it must be checked by hand even if everything else is trusted. */
  suspect?: boolean;
}

export interface ParsedInvoiceHeader {
  supplierName?: string;
  invoiceNumber?: string;
  invoiceDate?: Date;
  /** The total the document itself declares (payable amount), and its currency. */
  invoiceTotal?: number;
  currency?: string;
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
  /**
   * True only when the header (invoice number, date, total) was read from a document in a layout we recognise, so it is safe to
   * hold the uploader's typed values to it. The generic text heuristic guesses its header, so it never sets this.
   */
  headerReliable?: boolean;
}

export interface SupplierInvoiceParser {
  supports(mimeType: string, filename: string): boolean;
  parse(buffer: Buffer): Promise<ParsedInvoice>;
}
