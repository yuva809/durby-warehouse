/**
 * Live integration test for scripts/backfill-product-images.ts — run against
 * a real running stack (DB + Redis + the existing worker), same convention
 * as scripts/e2e-smoke-test.mjs: no mocking, real Prisma rows, real BullMQ
 * queue. Exercises runBackfill() directly (the exact function the CLI
 * entrypoint calls) so there is one implementation under test, not a copy.
 *
 * Isolation: runBackfill() intentionally scans the WHOLE Product table for
 * `image: null` — that's correct production behavior and is not changed
 * here. So that this test doesn't enqueue real jobs for whatever unrelated
 * products happen to be missing an image at the moment it runs, it first
 * "quarantines" every such product with a temporary ProductImage row
 * (tagged source: QUARANTINE_SOURCE) for the duration of the run, then
 * deletes exactly those rows afterward — restoring `image: null` on those
 * real products exactly as it found them. This keeps the test hitting the
 * real dev DB (this repo's existing testing convention — no separate test
 * database) while guaranteeing the only product runBackfill() can actually
 * queue is this test's own fixture.
 *
 * Run with: npm run test:backfill-product-images
 * (requires docker compose up -d postgres redis worker, or the full stack)
 */
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { ProductImageStatus, Role } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProductImageQueueService } from '../src/product-images/product-image-queue.service';
import { PRODUCT_IMAGE_QUEUE } from '../src/queue/queue.module';
import { createBackfillContext, runBackfill } from './backfill-product-images';

const QUARANTINE_SOURCE = '__backfill_test_quarantine__';

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) {
    pass++;
    console.log(`✓ ${label}`);
  } else {
    fail++;
    console.log(`✗ FAIL: ${label}`);
  }
}

async function waitUntil(cond: () => Promise<boolean>, timeoutMs = 20_000, intervalMs = 500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await cond()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

async function main() {
  const app = await createBackfillContext();
  const prisma = app.get(PrismaService);
  const queue = app.get(ProductImageQueueService);
  const rawQueue = app.get<Queue>(getQueueToken(PRODUCT_IMAGE_QUEUE));

  const suffix = Date.now();
  const manager = await prisma.user.findFirstOrThrow({ where: { role: Role.WAREHOUSE_MANAGER } });

  // Isolation: snapshot every OTHER product currently missing an image and
  // quarantine it (see file header) so this test's runBackfill() calls
  // can't enqueue real jobs for them. Restored in `finally` below.
  const preExisting = await prisma.product.findMany({ where: { image: null }, select: { id: true } });
  const quarantineIds = preExisting.map((p) => p.id);
  if (quarantineIds.length > 0) {
    await prisma.productImage.createMany({
      data: quarantineIds.map((productId) => ({
        productId,
        status: ProductImageStatus.NOT_FOUND,
        source: QUARANTINE_SOURCE,
        fetchedAt: new Date(),
      })),
    });
    console.log(`Quarantined ${quarantineIds.length} pre-existing real product(s) missing an image, so this run doesn't touch them.`);
  }

  // Fixtures: one product with no ProductImage row, three with an existing
  // row in different protected/terminal statuses.
  const noRow = await prisma.product.create({
    data: { sku: `BF-TEST-NOROW-${suffix}`, name: `Backfill Test No Row ${suffix}`, category: 'Misc', unit: 'pc', unitPrice: 1 },
  });
  const existingNotFound = await prisma.product.create({
    data: { sku: `BF-TEST-NOTFOUND-${suffix}`, name: `Backfill Test NotFound ${suffix}`, category: 'Misc', unit: 'pc', unitPrice: 1 },
  });
  const existingVerified = await prisma.product.create({
    data: { sku: `BF-TEST-VERIFIED-${suffix}`, name: `Backfill Test Verified ${suffix}`, category: 'Misc', unit: 'pc', unitPrice: 1 },
  });
  const existingManualUpload = await prisma.product.create({
    data: { sku: `BF-TEST-MANUAL-${suffix}`, name: `Backfill Test Manual ${suffix}`, category: 'Misc', unit: 'pc', unitPrice: 1 },
  });

  await prisma.productImage.create({
    data: { productId: existingNotFound.id, status: ProductImageStatus.NOT_FOUND, fetchedAt: new Date() },
  });
  const verifiedFixture = await prisma.productImage.create({
    data: {
      productId: existingVerified.id,
      status: ProductImageStatus.VERIFIED,
      imageUrl: 'https://example.com/protected-verified.jpg',
      confidence: 100,
      source: 'open_food_facts',
      verifiedById: manager.id,
      verifiedAt: new Date(),
      fetchedAt: new Date(),
    },
  });
  const manualFixture = await prisma.productImage.create({
    data: {
      productId: existingManualUpload.id,
      status: ProductImageStatus.MANUAL_UPLOAD,
      source: 'manual',
      verifiedById: manager.id,
      verifiedAt: new Date(),
    },
  });

  try {
    console.log('\n== Case: product with no ProductImage row gets queued ==');
    const beforeCounts = await rawQueue.getJobCounts('waiting', 'active', 'completed', 'delayed');
    const result1 = await runBackfill(prisma, queue);
    ok(result1.failed === 0, `First run enqueued with zero failures (failed=${result1.failed})`);

    const jobs = await rawQueue.getJobs(['waiting', 'active', 'completed', 'delayed'], 0, 500);
    const jobForNoRow = jobs.find((j) => j.data?.productId === noRow.id);
    ok(!!jobForNoRow, 'A job was enqueued for the product with no ProductImage row');
    void beforeCounts;

    console.log('\n== Case: products with an existing ProductImage row are skipped ==');
    ok(!jobs.some((j) => j.data?.productId === existingNotFound.id), 'NOT_FOUND product was not (re-)queued');
    ok(!jobs.some((j) => j.data?.productId === existingVerified.id), 'VERIFIED product was not (re-)queued');
    ok(!jobs.some((j) => j.data?.productId === existingManualUpload.id), 'MANUAL_UPLOAD product was not (re-)queued');

    console.log('\n== Waiting for the existing worker to actually process the new job ==');
    const processed = await waitUntil(async () => {
      const row = await prisma.productImage.findUnique({ where: { productId: noRow.id } });
      return !!row;
    });
    ok(processed, 'A ProductImage row was created for the previously-missing product (worker processed the job)');

    console.log('\n== Case: VERIFIED / MANUAL_UPLOAD records are never overwritten ==');
    const verifiedAfter = await prisma.productImage.findUnique({ where: { productId: existingVerified.id } });
    ok(
      verifiedAfter?.status === 'VERIFIED' && verifiedAfter?.imageUrl === verifiedFixture.imageUrl && verifiedAfter?.updatedAt.getTime() === verifiedFixture.updatedAt.getTime(),
      'VERIFIED row is byte-for-byte unchanged after backfill',
    );
    const manualAfter = await prisma.productImage.findUnique({ where: { productId: existingManualUpload.id } });
    ok(
      manualAfter?.status === 'MANUAL_UPLOAD' && manualAfter?.updatedAt.getTime() === manualFixture.updatedAt.getTime(),
      'MANUAL_UPLOAD row is byte-for-byte unchanged after backfill',
    );

    console.log('\n== Case: rerunning the backfill does not create duplicate ProductImage records ==');
    const countBeforeRerun = await prisma.productImage.count({
      where: { productId: { in: [noRow.id, existingNotFound.id, existingVerified.id, existingManualUpload.id] } },
    });
    ok(countBeforeRerun === 4, `Exactly one ProductImage row per fixture product before rerun (got ${countBeforeRerun})`);

    const result2 = await runBackfill(prisma, queue);
    const queuedForOurFixturesOnRerun = (await rawQueue.getJobs(['waiting', 'active', 'completed', 'delayed'], 0, 1000)).filter(
      (j) => j.data?.productId === noRow.id,
    ).length;
    ok(queuedForOurFixturesOnRerun === 1, `Rerun did not re-queue the now-backfilled product (still exactly 1 job total, got ${queuedForOurFixturesOnRerun})`);
    void result2;

    const countAfterRerun = await prisma.productImage.count({
      where: { productId: { in: [noRow.id, existingNotFound.id, existingVerified.id, existingManualUpload.id] } },
    });
    ok(countAfterRerun === 4, `Still exactly one ProductImage row per fixture product after rerun — no duplicates (got ${countAfterRerun})`);
  } finally {
    // Cleanup: remove every trace of this test run regardless of outcome.
    await prisma.productImage.deleteMany({ where: { productId: { in: [noRow.id, existingNotFound.id, existingVerified.id, existingManualUpload.id] } } });
    await prisma.product.deleteMany({ where: { id: { in: [noRow.id, existingNotFound.id, existingVerified.id, existingManualUpload.id] } } });
    // Un-quarantine: delete exactly the temporary rows this run added, restoring `image: null` on those real products.
    if (quarantineIds.length > 0) {
      await prisma.productImage.deleteMany({ where: { productId: { in: quarantineIds }, source: QUARANTINE_SOURCE } });
    }
    await app.close();
  }

  console.log(`\n${fail === 0 ? '✅ All checks passed.' : `❌ ${fail} check(s) failed.`} (${pass} passed, ${fail} failed)`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('CRASHED:', err);
  process.exit(1);
});
