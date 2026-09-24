import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ProductImageStatus, type ProductImage } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { bigramSimilarity, normalizeText } from '../common/text-similarity';
import { effectiveImageUrl } from './image-url.util';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { OpenFoodFactsProvider } from './providers/open-food-facts.provider';
import type { ProductImageCandidate, ProductImageProvider, ProductImageQuery } from './providers/types';

/** 0-100. At/above this, a text-search candidate goes live automatically (AUTO_MATCHED); below it, a manager must approve it (FOUND_NEEDS_REVIEW). Configurable per the spec's "make the provider configurable through environment variables". */
const CONFIDENCE_THRESHOLD = Number(process.env.PRODUCT_IMAGE_CONFIDENCE_THRESHOLD ?? 75);
/** Below this, don't even surface it as "needs review" — it's not plausibly the same product. */
const MINIMUM_PLAUSIBLE_SCORE = 30;

/** Extracts a normalized "quantity in grams-ish" token set from strings like "12x560g" or "560 gm" — deliberately crude (digits + unit), not a full unit-conversion engine. */
function packTokens(s: string | null | undefined): string {
  if (!s) return '';
  return s.toLowerCase().replace(/\s+/g, '').replace(/gm\b/, 'g').replace(/kgs?\b/, 'kg');
}

/**
 * Scores how likely a provider's candidate is the SAME product, from
 * agreement across independent identity fields — never from visual
 * similarity. An exact barcode hit bypasses this entirely (see
 * lookupAndSave): only text-search candidates are scored here. Deliberately
 * conservative — this is what stops "Maggi Masala Noodles 12x560g" from
 * silently receiving a photo of an unrelated Maggi product.
 */
function scoreCandidate(query: ProductImageQuery, candidate: ProductImageCandidate): number {
  const nameSim = bigramSimilarity(normalizeText(query.name), normalizeText(candidate.matchedName ?? ''));
  const brandMatch = query.brand && candidate.matchedBrand
    ? normalizeText(candidate.matchedBrand).includes(normalizeText(query.brand)) || normalizeText(query.brand).includes(normalizeText(candidate.matchedBrand))
    : false;
  const packMatch = query.pack && candidate.matchedPack ? packTokens(query.pack) === packTokens(candidate.matchedPack) : false;

  // Weights sum to 100. Name carries the most weight since it's always
  // present; brand and pack are corroborating signals when we have them to
  // compare — their absence isn't penalized, but their AGREEMENT raises
  // confidence and their DISAGREEMENT (checked implicitly by not matching)
  // caps how high a same-ish-name-different-product result can score.
  let score = nameSim * 60;
  if (brandMatch) score += 25;
  if (packMatch) score += 15;
  return Math.round(score);
}

@Injectable()
export class ProductImagesService {
  private readonly logger = new Logger(ProductImagesService.name);
  private readonly providers: ProductImageProvider[];

  constructor(
    private prisma: PrismaService,
    openFoodFacts: OpenFoodFactsProvider,
  ) {
    // Order matters: first configured provider to return a barcode hit (or
    // the first to return a plausible search candidate) wins. Adding a
    // second provider later is just adding it to this list.
    this.providers = [openFoodFacts];
  }

  async get(productId: string) {
    const image = await this.prisma.productImage.findUnique({
      where: { productId },
      include: { verifiedBy: { select: { name: true } } },
    });
    return this.toResponse(image);
  }

  /** Shapes the DB row into what the frontend renders — computing the effective display URL (own file endpoint for manual uploads) and never leaking imageData bytes. */
  private toResponse(image: (ProductImage & { verifiedBy?: { name: string } | null }) | null) {
    if (!image) return null;
    return {
      id: image.id,
      productId: image.productId,
      status: image.status,
      imageUrl: effectiveImageUrl(image.productId, image),
      source: image.source,
      confidence: image.confidence,
      matchedName: image.matchedName,
      matchedBrand: image.matchedBrand,
      matchedBarcode: image.matchedBarcode,
      attribution: image.attribution,
      fetchedAt: image.fetchedAt,
      verifiedById: image.verifiedById,
      verifiedAt: image.verifiedAt,
      verifiedBy: image.verifiedBy,
    };
  }

  /**
   * The one place that ever calls out to an image provider. Used both by
   * the manager's explicit "Find Image" button (synchronous, immediate
   * result) and by the supplier-invoice background job for newly
   * matched/created products (see product-image.processor.ts) — same
   * method either way. NEVER throws: a provider outage, timeout, or "no
   * candidate found" all resolve to a normal ProductImage row (NOT_FOUND
   * in the worst case), because a failed image lookup must never block
   * product creation or stock intake.
   */
  async lookupAndSave(productId: string, user?: AuthUser) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');

    // Already verified or manually uploaded — "search again" is an
    // explicit, separate action (see researchAgain below); a background
    // enrichment pass must never clobber a human's decision.
    const existing = await this.prisma.productImage.findUnique({ where: { productId } });
    if (existing && (existing.status === 'VERIFIED' || existing.status === 'MANUAL_UPLOAD')) {
      return this.toResponse(existing);
    }

    const query: ProductImageQuery = { name: product.name, brand: product.brand, pack: product.pack, barcode: product.barcode };
    let result: { candidate: ProductImageCandidate; confidence: number; status: ProductImageStatus } | null = null;

    for (const provider of this.providers) {
      if (!provider.isConfigured()) continue;
      try {
        if (query.barcode) {
          const hit = await provider.lookupByBarcode(query.barcode);
          if (hit) {
            result = { candidate: hit, confidence: 100, status: ProductImageStatus.AUTO_MATCHED };
            break;
          }
        }
        const candidate = await provider.searchByName(query);
        if (candidate) {
          const score = scoreCandidate(query, candidate);
          if (score >= MINIMUM_PLAUSIBLE_SCORE) {
            result = {
              candidate,
              confidence: score,
              status: score >= CONFIDENCE_THRESHOLD ? ProductImageStatus.AUTO_MATCHED : ProductImageStatus.FOUND_NEEDS_REVIEW,
            };
            break;
          }
        }
      } catch (err) {
        // Belt and braces on top of the provider's own internal try/catch —
        // whatever goes wrong with one provider, move on / fall through to
        // NOT_FOUND rather than ever propagating an error to the caller.
        this.logger.warn(`Image provider "${provider.name}" failed for product ${productId}: ${(err as Error).message}`);
      }
    }

    const data = result
      ? {
          status: result.status,
          imageUrl: result.candidate.imageUrl,
          imageData: null,
          imageMimeType: null,
          source: result.candidate.source,
          confidence: result.confidence,
          matchedName: result.candidate.matchedName ?? null,
          matchedBrand: result.candidate.matchedBrand ?? null,
          matchedBarcode: result.candidate.matchedBarcode ?? null,
          attribution: result.candidate.attribution,
          fetchedAt: new Date(),
        }
      : {
          status: ProductImageStatus.NOT_FOUND,
          imageUrl: null,
          imageData: null,
          imageMimeType: null,
          source: null,
          confidence: null,
          matchedName: null,
          matchedBrand: null,
          matchedBarcode: null,
          attribution: null,
          fetchedAt: new Date(),
        };

    const saved = await this.prisma.productImage.upsert({
      where: { productId },
      create: { productId, ...data },
      update: data,
    });
    return this.toResponse(saved);
  }

  /** Explicit re-search — the only path allowed to overwrite a VERIFIED/MANUAL_UPLOAD image, since the manager asked for it directly. */
  async searchAgain(productId: string) {
    await this.prisma.productImage.deleteMany({ where: { productId } });
    return this.lookupAndSave(productId);
  }

  /** Manager confirms a candidate is correct — AUTO_MATCHED or FOUND_NEEDS_REVIEW both become VERIFIED. This is the only status transition a manager triggers directly on an auto-found candidate. */
  async approve(productId: string, user: AuthUser) {
    const image = await this.prisma.productImage.findUnique({ where: { productId } });
    if (!image || !image.imageUrl) {
      throw new ConflictException('No candidate image to approve for this product');
    }
    const updated = await this.prisma.productImage.update({
      where: { productId },
      data: { status: ProductImageStatus.VERIFIED, verifiedById: user.userId, verifiedAt: new Date() },
    });
    return this.toResponse(updated);
  }

  async manualUpload(productId: string, file: { buffer: Buffer; mimetype: string }, user: AuthUser) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');
    const updated = await this.prisma.productImage.upsert({
      where: { productId },
      create: {
        productId,
        status: ProductImageStatus.MANUAL_UPLOAD,
        imageData: new Uint8Array(file.buffer),
        imageMimeType: file.mimetype,
        source: 'manual',
        verifiedById: user.userId,
        verifiedAt: new Date(),
      },
      update: {
        status: ProductImageStatus.MANUAL_UPLOAD,
        imageUrl: null,
        imageData: new Uint8Array(file.buffer),
        imageMimeType: file.mimetype,
        source: 'manual',
        confidence: null,
        matchedName: null,
        matchedBrand: null,
        matchedBarcode: null,
        attribution: null,
        verifiedById: user.userId,
        verifiedAt: new Date(),
      },
    });
    return this.toResponse(updated);
  }

  async remove(productId: string) {
    await this.prisma.productImage.deleteMany({ where: { productId } });
  }

  async getFile(productId: string) {
    const image = await this.prisma.productImage.findUnique({ where: { productId } });
    if (!image?.imageData) throw new NotFoundException('No uploaded image file for this product');
    return image;
  }
}
