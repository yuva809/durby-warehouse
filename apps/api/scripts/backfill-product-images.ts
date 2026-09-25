/**
 * One-time backfill: enqueue the EXISTING product-image lookup
 * (ProductImageQueueService.enqueueLookup -> the same BullMQ queue ->
 * ProductImageProcessor -> ProductImagesService.lookupAndSave -> the same
 * OpenFoodFactsProvider/confidence-scoring pipeline the app already uses)
 * for every product that currently has NO ProductImage row at all.
 *
 * Why this exists: enrichment has always only ever been triggered by (1) a
 * manager's manual "Find Image" click, or (2) a product being matched as a
 * line item on an uploaded supplier invoice. Products seeded directly into
 * the database (the original 47-product demo catalog) never passed through
 * either trigger, so most of the catalog has never had a lookup attempted —
 * not "no image found", just never asked. This script is the missing
 * one-time trigger for that backlog; it adds no new lookup logic of its own.
 *
 * Safe to re-run: it only selects products where `image` is null (no row),
 * and lookupAndSave's own upsert creates a row on first run. On any later
 * run, every previously-backfilled product already has a row (even a
 * NOT_FOUND one) and so is no longer selected — nothing gets re-queued or
 * re-searched, and VERIFIED/MANUAL_UPLOAD/AUTO_MATCHED/FOUND_NEEDS_REVIEW/
 * NOT_FOUND rows are never touched.
 *
 * Run with: npm run backfill:product-images
 */
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProductImagesModule } from '../src/product-images/product-images.module';
import { ProductImageQueueService } from '../src/product-images/product-image-queue.service';

// Deliberately minimal — just DB access plus the existing image-enrichment
// producer, not the full API module graph (no HTTP, auth, controllers).
@Module({ imports: [PrismaModule, ProductImagesModule] })
class BackfillModule {}

export interface BackfillResult {
  totalProducts: number;
  alreadyHadImage: number;
  queued: number;
  failed: number;
}

/**
 * Core backfill logic, factored out so the CLI entrypoint below and
 * scripts/backfill-product-images.test.ts exercise the exact same code —
 * no second implementation to drift out of sync.
 */
export async function runBackfill(prisma: PrismaService, queue: ProductImageQueueService): Promise<BackfillResult> {
  const totalProducts = await prisma.product.count();
  const missing = await prisma.product.findMany({
    where: { image: null },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  const alreadyHadImage = totalProducts - missing.length;

  let queued = 0;
  let failed = 0;
  for (const product of missing) {
    try {
      await queue.enqueueLookup(product.id);
      queued++;
    } catch (err) {
      // enqueueLookup itself swallows/logs its own failures and never
      // rejects in normal operation — this is a last-resort net for a
      // genuinely unexpected error (e.g. DI/connection failure) so one
      // bad entry can't abort the whole backfill run.
      failed++;
      console.warn(`Failed to enqueue lookup for "${product.name}" (${product.id}): ${(err as Error).message}`);
    }
  }

  return { totalProducts, alreadyHadImage, queued, failed };
}

export async function createBackfillContext() {
  return NestFactory.createApplicationContext(BackfillModule, { logger: ['warn', 'error'] });
}

async function main() {
  const app = await createBackfillContext();
  try {
    const prisma = app.get(PrismaService);
    const queue = app.get(ProductImageQueueService);

    const before = await prisma.product.count({ where: { image: null } });
    console.log(`Products with no ProductImage row: ${before}`);

    const result = await runBackfill(prisma, queue);

    console.log('\n=== Backfill summary ===');
    console.log(`Total products:        ${result.totalProducts}`);
    console.log(`Already had image row: ${result.alreadyHadImage} (skipped)`);
    console.log(`Queued:                ${result.queued}`);
    console.log(`Failed to enqueue:     ${result.failed}`);
    console.log('\nJobs are now processing on the existing BullMQ worker (concurrency 1 — see product-image.processor.ts — so Open Food Facts is called one product at a time, never in parallel).');
    console.log('Re-run this script at any time to pick up any newly-added products with no image row; already-backfilled products will not be re-queued.');
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
}
