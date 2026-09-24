import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { bigramSimilarity, normalizeText } from '../common/text-similarity';

export type MatchConfidence = 'exact' | 'fuzzy' | 'unmatched';

export interface MatchResult {
  productId: string | null;
  confidence: MatchConfidence;
}

const FUZZY_THRESHOLD = 0.55;

/**
 * Deterministic, explainable product matching for supplier invoice import —
 * explicitly NOT an AI/ML pipeline (out of scope for this batch). Exact SKU
 * or exact normalized-name matches are trusted automatically; anything else
 * is either a fuzzy suggestion (still flagged needsReview) or left
 * unmatched for the manager to resolve on the review screen. Swappable
 * later behind the same shape if a smarter matcher is ever added.
 */
@Injectable()
export class ImportMatchingService {
  constructor(private prisma: PrismaService) {}

  async matchProduct(rawDescription: string, rawCode: string | undefined): Promise<MatchResult> {
    const products = await this.prisma.product.findMany({ where: { active: true }, select: { id: true, sku: true, name: true } });

    if (rawCode) {
      const codeNorm = rawCode.trim().toLowerCase();
      const exact = products.find((p) => p.sku.toLowerCase() === codeNorm);
      if (exact) return { productId: exact.id, confidence: 'exact' };
    }

    const descNorm = normalizeText(rawDescription);
    const exactName = products.find((p) => normalizeText(p.name) === descNorm);
    if (exactName) return { productId: exactName.id, confidence: 'exact' };

    let best: { id: string; score: number } | null = null;
    for (const p of products) {
      const score = bigramSimilarity(descNorm, normalizeText(p.name));
      if (!best || score > best.score) best = { id: p.id, score };
    }
    if (best && best.score >= FUZZY_THRESHOLD) {
      return { productId: best.id, confidence: 'fuzzy' };
    }
    return { productId: null, confidence: 'unmatched' };
  }
}
