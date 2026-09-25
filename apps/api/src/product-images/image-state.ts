import type { ProductImageStatus } from '@prisma/client';

/**
 * Quality ordering of a stored image result. A lookup may only ever move a
 * product UP this ladder (or sideways to a strictly more confident result of
 * the same rank) — never down. Providers swallow their own errors and report
 * "nothing found", so a NOT_FOUND result can't be told apart from a transient
 * outage; treating it as authoritative is what used to wipe good images.
 */
const RANK: Record<ProductImageStatus, number> = {
  NOT_FOUND: 0,
  FOUND_NEEDS_REVIEW: 1,
  AUTO_MATCHED: 2,
  VERIFIED: 3,
  MANUAL_UPLOAD: 3,
};

/** A human's decision (approved or uploaded) — only an explicit `force` search may replace it. */
export function isHumanDecided(status: ProductImageStatus): boolean {
  return status === 'VERIFIED' || status === 'MANUAL_UPLOAD';
}

interface Comparable {
  status: ProductImageStatus;
  confidence?: number | null;
}

/**
 * Whether an incoming lookup result may replace what's stored.
 * - Nothing stored: yes.
 * - VERIFIED / MANUAL_UPLOAD: only when the manager explicitly forced a
 *   re-search AND it found a real candidate.
 * - An empty (NOT_FOUND) result never replaces a stored image; it may only
 *   refresh another NOT_FOUND.
 * - A forced (explicit) search replaces with any real candidate.
 * - Background/automatic lookups: replace only with a strictly better rank,
 *   or the same rank with strictly higher confidence.
 */
export function shouldReplaceImage(existing: Comparable | null, incoming: Comparable, force = false): boolean {
  if (!existing) return true;
  if (isHumanDecided(existing.status)) return force && incoming.status !== 'NOT_FOUND';
  if (incoming.status === 'NOT_FOUND') return existing.status === 'NOT_FOUND';
  if (force) return true;
  if (RANK[incoming.status] !== RANK[existing.status]) return RANK[incoming.status] > RANK[existing.status];
  return (incoming.confidence ?? 0) > (existing.confidence ?? 0);
}
