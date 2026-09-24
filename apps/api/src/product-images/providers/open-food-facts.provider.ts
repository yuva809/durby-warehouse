import { Injectable, Logger } from '@nestjs/common';
import type { ProductImageCandidate, ProductImageProvider, ProductImageQuery } from './types';

const BASE_URL = 'https://world.openfoodfacts.org';
// Identifying User-Agent as required by Open Food Facts' API usage guidelines
// (https://openfoodfacts.github.io/openfoodfacts-server/api/) — anonymous/
// unidentified traffic is more likely to be rate-limited.
const USER_AGENT = 'DurbyWarehouse/1.0 (warehouse inventory catalog enrichment)';
const ATTRIBUTION = 'Product data from Open Food Facts (openfoodfacts.org), licensed CC BY-SA 3.0';
const TIMEOUT_MS = 6000;

/**
 * Open Food Facts (https://world.openfoodfacts.org) — a free, open,
 * collaborative grocery/FMCG product database. Chosen specifically because:
 *  - no API key/signup required, so this provider works out of the box in
 *    every environment (local dev included) without any configuration —
 *    satisfying "if no provider is configured, still work gracefully";
 *  - its data and images are explicitly licensed for reuse (Open Database
 *    License for data, Creative Commons BY-SA for photos), unlike scraping
 *    a search engine's image results;
 *  - it's the right catalog for this business (grocery/FMCG), matching the
 *    exact product examples in the spec (Maggi, Bournvita, Horlicks, ...).
 * Swappable: this is one ProductImageProvider among potentially several —
 * see providers/types.ts. A second, licensed/paid provider can be added
 * later behind the same interface without touching ProductImageService.
 */
@Injectable()
export class OpenFoodFactsProvider implements ProductImageProvider {
  readonly name = 'open_food_facts';
  private readonly logger = new Logger(OpenFoodFactsProvider.name);

  /** Always usable — no credentials needed. A future paid provider would check its API key here instead. */
  isConfigured(): boolean {
    return true;
  }

  private async fetchJson(url: string): Promise<any | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: controller.signal });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      // Network hiccup, timeout, or the API being down — never throws out of
      // this provider. A failed lookup must never block stock intake or
      // product creation; the caller treats a null return as "no candidate".
      this.logger.warn(`Open Food Facts request failed: ${(err as Error).message}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async lookupByBarcode(barcode: string): Promise<ProductImageCandidate | null> {
    const data = await this.fetchJson(`${BASE_URL}/api/v2/product/${encodeURIComponent(barcode)}.json`);
    const p = data?.status === 1 ? data.product : null;
    const imageUrl = p?.image_front_url ?? p?.image_url;
    if (!p || !imageUrl) return null;
    return {
      imageUrl,
      source: this.name,
      matchedName: p.product_name,
      matchedBrand: p.brands,
      matchedBarcode: p.code,
      matchedPack: p.quantity,
      exactIdentityMatch: true,
      attribution: ATTRIBUTION,
    };
  }

  async searchByName(query: ProductImageQuery): Promise<ProductImageCandidate | null> {
    const terms = [query.name, query.brand].filter(Boolean).join(' ');
    const url = `${BASE_URL}/cgi/search.pl?search_terms=${encodeURIComponent(terms)}&search_simple=1&action=process&json=1&page_size=5`;
    const data = await this.fetchJson(url);
    const products: any[] = data?.products ?? [];
    // Only ever hand the caller ONE candidate — picking among several
    // loosely-matching results is exactly the kind of silent guessing the
    // confidence scorer (ProductImageService) exists to prevent, so leave
    // that judgment entirely to the scorer's field-by-field comparison
    // rather than this provider trying to be clever about ranking.
    const best = products.find((p) => p.image_front_url ?? p.image_url);
    if (!best) return null;
    return {
      imageUrl: best.image_front_url ?? best.image_url,
      source: this.name,
      matchedName: best.product_name,
      matchedBrand: best.brands,
      matchedBarcode: best.code,
      matchedPack: best.quantity,
      exactIdentityMatch: false,
      attribution: ATTRIBUTION,
    };
  }
}
