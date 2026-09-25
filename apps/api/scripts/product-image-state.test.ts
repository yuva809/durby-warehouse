/**
 * Regression tests for the product-image write path (ProductImagesService).
 * Real ProductImagesService + real Postgres, but with a scripted stub
 * provider so "no result", "outage" and slow/concurrent jobs are
 * deterministic and never touch Open Food Facts or the BullMQ queue. Only
 * this test's own fixture products are ever read or written.
 *
 * Covers: the shouldReplaceImage decision table; a lookup that returns
 * nothing never wipes an existing good image; VERIFIED / MANUAL_UPLOAD stay
 * protected (and aren't even re-searched); an explicit search-again can
 * replace them but never with nothing; and concurrent / stale jobs (including
 * one racing a manager's manual upload) can't replace a better result.
 *
 * Run with: npm run test:product-image-state
 * (needs Postgres; DATABASE_URL must point at it — see docker-compose.yml)
 */
import { Prisma, ProductImageStatus, Role } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProductImagesService } from '../src/product-images/product-images.service';
import { shouldReplaceImage } from '../src/product-images/image-state';
import type { OpenFoodFactsProvider } from '../src/product-images/providers/open-food-facts.provider';
import type { ProductImageCandidate, ProductImageQuery } from '../src/product-images/providers/types';
import type { AuthUser } from '../src/common/decorators/current-user.decorator';

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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- scripted stub provider ------------------------------------------------
type Script = { kind: 'strong' | 'medium' | 'weak' | 'none'; delayMs?: number };
class StubProvider {
  readonly name = 'stub';
  calls = 0;
  private script: Script = { kind: 'none' };
  set(script: Script) {
    this.script = script;
  }
  isConfigured() {
    return true;
  }
  async lookupByBarcode() {
    return null;
  }
  async searchByName(q: ProductImageQuery): Promise<ProductImageCandidate | null> {
    this.calls++;
    const { kind, delayMs = 0 } = this.script;
    if (delayMs) await sleep(delayMs);
    if (kind === 'none') return null;
    // Same name (=> 60) [+ same brand => 85] [+ same pack => 100]: scores are
    // controlled by what we echo back, using the real scorer untouched.
    return {
      imageUrl: `https://stub.invalid/${kind}.jpg`,
      source: 'stub',
      matchedName: q.name,
      matchedBrand: kind === 'strong' || kind === 'medium' ? (q.brand ?? undefined) : undefined,
      matchedPack: kind === 'strong' ? (q.pack ?? undefined) : undefined,
      exactIdentityMatch: false,
      attribution: 'stub',
    };
  }
}

async function main() {
  // ---- 1. pure decision table ---------------------------------------------
  console.log('== shouldReplaceImage decision table ==');
  const S = (status: ProductImageStatus, confidence: number | null = null) => ({ status, confidence });
  ok(shouldReplaceImage(null, S('NOT_FOUND')), 'nothing stored => store (even NOT_FOUND)');
  ok(!shouldReplaceImage(S('AUTO_MATCHED', 85), S('NOT_FOUND')), 'AUTO_MATCHED is never replaced by NOT_FOUND');
  ok(!shouldReplaceImage(S('FOUND_NEEDS_REVIEW', 50), S('NOT_FOUND')), 'FOUND_NEEDS_REVIEW is never replaced by NOT_FOUND');
  ok(shouldReplaceImage(S('NOT_FOUND'), S('NOT_FOUND')), 'NOT_FOUND may refresh NOT_FOUND');
  ok(shouldReplaceImage(S('NOT_FOUND'), S('FOUND_NEEDS_REVIEW', 55)), 'NOT_FOUND => FOUND_NEEDS_REVIEW upgrade');
  ok(shouldReplaceImage(S('NOT_FOUND'), S('AUTO_MATCHED', 85)), 'NOT_FOUND => AUTO_MATCHED upgrade');
  ok(shouldReplaceImage(S('FOUND_NEEDS_REVIEW', 55), S('AUTO_MATCHED', 85)), 'FOUND_NEEDS_REVIEW => AUTO_MATCHED upgrade');
  ok(!shouldReplaceImage(S('AUTO_MATCHED', 85), S('FOUND_NEEDS_REVIEW', 60)), 'AUTO_MATCHED is not downgraded to FOUND_NEEDS_REVIEW');
  ok(shouldReplaceImage(S('AUTO_MATCHED', 85), S('AUTO_MATCHED', 100)), 'same rank, strictly higher confidence => replace');
  ok(!shouldReplaceImage(S('AUTO_MATCHED', 85), S('AUTO_MATCHED', 85)), 'same rank, equal confidence => keep (no churn)');
  ok(!shouldReplaceImage(S('AUTO_MATCHED', 100), S('AUTO_MATCHED', 85)), 'same rank, lower confidence => keep');
  for (const protectedStatus of ['VERIFIED', 'MANUAL_UPLOAD'] as const) {
    ok(!shouldReplaceImage(S(protectedStatus), S('AUTO_MATCHED', 100)), `${protectedStatus} is never replaced by an automatic lookup`);
    ok(!shouldReplaceImage(S(protectedStatus), S('NOT_FOUND'), true), `${protectedStatus} is never replaced by NOT_FOUND, even when forced`);
    ok(shouldReplaceImage(S(protectedStatus), S('FOUND_NEEDS_REVIEW', 50), true), `${protectedStatus} can be replaced by an explicit (forced) search that found a candidate`);
  }
  ok(shouldReplaceImage(S('AUTO_MATCHED', 100), S('FOUND_NEEDS_REVIEW', 40), true), 'forced search replaces an unprotected image with any real candidate');

  // ---- 2. real service + real DB, stub provider ---------------------------
  const prisma = new PrismaService();
  await prisma.$connect();
  const provider = new StubProvider();
  const service = new ProductImagesService(prisma, provider as unknown as OpenFoodFactsProvider);
  const manager = await prisma.user.findFirstOrThrow({ where: { role: Role.WAREHOUSE_MANAGER } });
  const managerAuth: AuthUser = { userId: manager.id, email: manager.email, role: manager.role, locationId: null };

  const suffix = Date.now();
  const fixtureIds: string[] = [];
  let n = 0;
  async function fixture(seed?: Omit<Prisma.ProductImageUncheckedCreateInput, 'productId'>) {
    const p = await prisma.product.create({
      data: { sku: `IMG-STATE-${suffix}-${n++}`, name: `ImgState Rice ${suffix}-${n}`, brand: 'ImgBrand', pack: '5kg', category: 'Misc', unit: 'pc', unitPrice: 1 },
    });
    fixtureIds.push(p.id);
    if (seed) await prisma.productImage.create({ data: { productId: p.id, ...seed } });
    return p.id;
  }
  const row = (productId: string) => prisma.productImage.findUnique({ where: { productId } });

  try {
    console.log('\n== a lookup that returns nothing never wipes an existing good image ==');
    let id = await fixture({ status: 'AUTO_MATCHED', imageUrl: 'https://stub.invalid/original.jpg', confidence: 85, source: 'stub', fetchedAt: new Date() });
    provider.set({ kind: 'none' });
    await service.lookupAndSave(id);
    let r = await row(id);
    ok(r?.status === 'AUTO_MATCHED' && r.imageUrl === 'https://stub.invalid/original.jpg' && r.confidence === 85, 'AUTO_MATCHED + empty lookup => image preserved (the reported bug)');

    id = await fixture({ status: 'FOUND_NEEDS_REVIEW', imageUrl: 'https://stub.invalid/candidate.jpg', confidence: 55, source: 'stub', fetchedAt: new Date() });
    await service.lookupAndSave(id);
    r = await row(id);
    ok(r?.status === 'FOUND_NEEDS_REVIEW' && r.imageUrl === 'https://stub.invalid/candidate.jpg', 'FOUND_NEEDS_REVIEW + empty lookup => candidate preserved');

    id = await fixture();
    await service.lookupAndSave(id);
    r = await row(id);
    ok(r?.status === 'NOT_FOUND', 'no row + empty lookup => NOT_FOUND recorded (still the normal first result)');

    console.log('\n== upgrades and non-downgrades between real results ==');
    provider.set({ kind: 'medium' });
    await service.lookupAndSave(id);
    r = await row(id);
    ok(r?.status === 'AUTO_MATCHED' && r.confidence === 85, 'NOT_FOUND + later good result => upgraded to AUTO_MATCHED');
    provider.set({ kind: 'weak' });
    await service.lookupAndSave(id);
    r = await row(id);
    ok(r?.status === 'AUTO_MATCHED' && r.confidence === 85, 'AUTO_MATCHED + later weaker (review-level) result => kept');
    provider.set({ kind: 'strong' });
    await service.lookupAndSave(id);
    r = await row(id);
    ok(r?.status === 'AUTO_MATCHED' && r.confidence === 100, 'AUTO_MATCHED + later more confident result => replaced');

    console.log('\n== VERIFIED / MANUAL_UPLOAD stay protected ==');
    id = await fixture({ status: 'VERIFIED', imageUrl: 'https://stub.invalid/verified.jpg', confidence: 85, source: 'stub', verifiedById: manager.id, verifiedAt: new Date(), fetchedAt: new Date() });
    provider.set({ kind: 'strong' });
    provider.calls = 0;
    await service.lookupAndSave(id);
    r = await row(id);
    ok(r?.status === 'VERIFIED' && r.imageUrl === 'https://stub.invalid/verified.jpg' && provider.calls === 0, 'VERIFIED is untouched by a background lookup (provider not even called)');
    const verifiedId = id;

    id = await fixture({ status: 'MANUAL_UPLOAD', source: 'manual', imageData: new Uint8Array([1, 2, 3]), imageMimeType: 'image/png', verifiedById: manager.id, verifiedAt: new Date() });
    provider.calls = 0;
    await service.lookupAndSave(id);
    r = await row(id);
    ok(r?.status === 'MANUAL_UPLOAD' && r.imageData?.length === 3 && provider.calls === 0, 'MANUAL_UPLOAD is untouched by a background lookup (provider not even called)');
    const manualId = id;

    console.log('\n== explicit search-again ==');
    provider.set({ kind: 'none' });
    await service.searchAgain(verifiedId);
    r = await row(verifiedId);
    ok(r?.status === 'VERIFIED' && r.imageUrl === 'https://stub.invalid/verified.jpg', 'search-again that finds nothing KEEPS the VERIFIED image (used to delete it first)');
    await service.searchAgain(manualId);
    r = await row(manualId);
    ok(r?.status === 'MANUAL_UPLOAD' && r.imageData?.length === 3, 'search-again that finds nothing KEEPS the manual upload');
    provider.set({ kind: 'strong' });
    await service.searchAgain(verifiedId);
    r = await row(verifiedId);
    ok(r?.status === 'AUTO_MATCHED' && r.imageUrl === 'https://stub.invalid/strong.jpg' && r.verifiedById === null, 'search-again that finds a candidate replaces VERIFIED and clears the verification');
    ok((await prisma.productImage.count({ where: { productId: verifiedId } })) === 1, 'still exactly one row for the product');

    console.log('\n== concurrent / stale jobs ==');
    // Slow good job vs fast empty job, both starting with no row.
    id = await fixture();
    provider.set({ kind: 'medium', delayMs: 300 });
    const slowGood = service.lookupAndSave(id);
    await sleep(80);
    provider.set({ kind: 'none' });
    const fastEmpty = service.lookupAndSave(id);
    await Promise.all([slowGood, fastEmpty]);
    r = await row(id);
    ok(r?.status === 'AUTO_MATCHED' && r.confidence === 85, 'empty job finishing first, good job second => good result wins');

    // Fast good job vs slow stale empty job (the stale-overwrite case).
    id = await fixture();
    provider.set({ kind: 'none', delayMs: 300 });
    const slowEmpty = service.lookupAndSave(id);
    await sleep(80);
    provider.set({ kind: 'medium' });
    const fastGood = service.lookupAndSave(id);
    await Promise.all([slowEmpty, fastGood]);
    r = await row(id);
    ok(r?.status === 'AUTO_MATCHED' && r.confidence === 85, 'good job finishing first, stale empty job second => good result kept');

    // Many simultaneous first-time jobs race to create the row.
    id = await fixture();
    provider.set({ kind: 'medium' });
    const batch = await Promise.allSettled([service.lookupAndSave(id), service.lookupAndSave(id), service.lookupAndSave(id), service.lookupAndSave(id), service.lookupAndSave(id), service.lookupAndSave(id)]);
    r = await row(id);
    ok(batch.every((b) => b.status === 'fulfilled'), '6 simultaneous first lookups all succeed (create race handled, no unique-constraint error)');
    ok(r?.status === 'AUTO_MATCHED' && (await prisma.productImage.count({ where: { productId: id } })) === 1, '...and leave exactly one AUTO_MATCHED row');

    // Background job in flight while the manager uploads their own image.
    id = await fixture({ status: 'FOUND_NEEDS_REVIEW', imageUrl: 'https://stub.invalid/candidate.jpg', confidence: 55, source: 'stub', fetchedAt: new Date() });
    provider.set({ kind: 'strong', delayMs: 300 });
    const inFlight = service.lookupAndSave(id);
    await sleep(100);
    await service.manualUpload(id, { buffer: Buffer.from([9, 9, 9]), mimetype: 'image/png' }, managerAuth);
    await inFlight;
    r = await row(id);
    ok(r?.status === 'MANUAL_UPLOAD' && r.imageData?.length === 3, "a lookup that started before the manager's upload cannot overwrite it");

    // Same, for a manager approval.
    id = await fixture({ status: 'FOUND_NEEDS_REVIEW', imageUrl: 'https://stub.invalid/candidate.jpg', confidence: 55, source: 'stub', fetchedAt: new Date() });
    provider.set({ kind: 'strong', delayMs: 300 });
    const inFlight2 = service.lookupAndSave(id);
    await sleep(100);
    await service.approve(id, managerAuth);
    await inFlight2;
    r = await row(id);
    ok(r?.status === 'VERIFIED' && r.imageUrl === 'https://stub.invalid/candidate.jpg', "a lookup that started before the manager's approval cannot overwrite the approved image");
  } finally {
    await prisma.productImage.deleteMany({ where: { productId: { in: fixtureIds } } });
    await prisma.product.deleteMany({ where: { id: { in: fixtureIds } } });
    await prisma.$disconnect();
  }

  console.log(`\n${fail === 0 ? '✅ All checks passed.' : `❌ ${fail} check(s) failed.`} (${pass} passed, ${fail} failed)`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('CRASHED:', err);
  process.exit(1);
});
