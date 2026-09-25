import { createHash, randomInt } from 'node:crypto';

// Crockford base32: no I, L, O or U, so a code read aloud or copied by hand is hard to mistype.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const RESET_CODE_LENGTH = 20; // 20 chars x 5 bits = 100 bits of entropy

/** A fresh one-time reset code, e.g. "7GQ2M-XK4D9-P0RTV-83BNH". */
export function generateResetCode(): string {
  let raw = '';
  for (let i = 0; i < RESET_CODE_LENGTH; i++) raw += ALPHABET[randomInt(ALPHABET.length)];
  return raw.replace(/(.{5})(?=.)/g, '$1-');
}

/**
 * Canonical form of whatever the user typed: strips separators/whitespace,
 * upper-cases and applies Crockford's look-alike mapping (O->0, I/L->1).
 * Returns null when it can't possibly be a valid code (wrong length or characters).
 */
export function normalizeResetCode(input: string): string | null {
  const cleaned = (input ?? '').toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (cleaned.length !== RESET_CODE_LENGTH) return null;
  for (const ch of cleaned) if (!ALPHABET.includes(ch)) return null;
  return cleaned;
}

/** Only this hash is ever stored; the code itself exists only in the admin's one-time response. */
export function hashResetCode(normalized: string): string {
  return createHash('sha256').update(normalized).digest('hex');
}
