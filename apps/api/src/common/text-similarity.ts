/**
 * Small, dependency-free, deterministic string-similarity helpers — shared
 * by every "is this the same product?" comparison in the app (supplier
 * invoice line matching). Explicitly not
 * an AI/ML pipeline; every score here is explainable from the two input
 * strings alone.
 */

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ');
}

/** Dice's coefficient over character bigrams — 1 for identical strings, 0 for no shared bigrams. */
export function bigramSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s: string) => {
    const set = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      set.set(bg, (set.get(bg) ?? 0) + 1);
    }
    return set;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  let overlap = 0;
  for (const [bg, count] of A) {
    const bCount = B.get(bg) ?? 0;
    overlap += Math.min(count, bCount);
  }
  const total = [...A.values()].reduce((s, n) => s + n, 0) + [...B.values()].reduce((s, n) => s + n, 0);
  return total === 0 ? 0 : (2 * overlap) / total;
}
