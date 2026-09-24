/**
 * Format-agnostic contract every image-lookup source implements — mirrors
 * the SupplierInvoiceParser pattern in ../../supplier-invoices/parsers:
 * one small interface, swappable/addable implementations, no provider ever
 * hard-wired into the calling code. A provider only ever proposes a
 * candidate; ProductImageService is solely responsible for scoring it and
 * deciding whether that's confident enough to go live automatically.
 */
export interface ProductImageQuery {
  name: string;
  brand?: string | null;
  pack?: string | null;
  barcode?: string | null;
}

export interface ProductImageCandidate {
  imageUrl: string;
  source: string;
  /** What the provider itself called this product — used by the scorer, not trusted as-is. */
  matchedName?: string;
  matchedBrand?: string;
  matchedBarcode?: string;
  matchedPack?: string;
  /** True only for an exact identity lookup (e.g. barcode hit) — the scorer treats this as maximum confidence. */
  exactIdentityMatch: boolean;
  attribution: string;
}

export interface ProductImageProvider {
  readonly name: string;
  /** Whether this provider is usable right now (e.g. has the credentials it needs) — checked before every call so a misconfigured/absent provider degrades to "no candidate" rather than throwing. */
  isConfigured(): boolean;
  /** Exact identity lookup — implement only if the provider supports it; return null otherwise. */
  lookupByBarcode(barcode: string): Promise<ProductImageCandidate | null>;
  /** Best-effort text search — return the single best candidate, or null. */
  searchByName(query: ProductImageQuery): Promise<ProductImageCandidate | null>;
}
