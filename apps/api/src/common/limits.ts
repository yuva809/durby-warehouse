/**
 * Largest quantity any single input may carry. Quantities live in 32-bit integer columns; without an upper bound a
 * typo, a barcode read as a quantity, or a malicious request reaches the database and fails as an opaque 500.
 * One million is far above any real stock line and far below the 2.1 billion column limit.
 */
export const MAX_QUANTITY = 1_000_000;
