/**
 * Regression test: an unreviewed FOUND_NEEDS_REVIEW candidate must never be
 * handed to list/detail views as a displayable image (the manager Products
 * grid was rendering it as if confirmed), while the review workflow — the
 * candidate readable via GET /products/:id/image, approve => VERIFIED —
 * keeps working exactly as before.
 *
 * Runs against the live API (default http://localhost:3001/api, override
 * with API_URL) and the same Postgres for fixtures; only its own fixture
 * product is touched. Doesn't enqueue any lookup or upload any invoice.
 * Frontend rendering of the marker is verified in the browser, not here —
 * this repo has no frontend test runner.
 *
 * Run with: npm run test:product-image-display
 * (DATABASE_URL must point at the stack's Postgres, as for the other scripts)
 */
import { Role } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { displayImageUrl } from '../src/product-images/image-url.util';

const BASE = process.env.API_URL ?? 'http://localhost:3001/api';
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

async function login(email: string) {
  const res = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: process.env.SEED_DEMO_PASSWORD ?? 'ChangeMe123!' }) });
  if (!res.ok) throw new Error(`login ${email} failed: ${res.status}`);
  return ((await res.json()) as { accessToken: string }).accessToken;
}
async function api(token: string, path: string, method = 'GET') {
  const res = await fetch(`${BASE}${path}`, { method, headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : undefined };
}

async function main() {
  console.log('== displayImageUrl (shared by product list/detail and stock-intake lines) ==');
  ok(displayImageUrl('p1', { status: 'FOUND_NEEDS_REVIEW', imageUrl: 'https://x.invalid/a.jpg' }) === null, 'FOUND_NEEDS_REVIEW => no displayable URL');
  ok(displayImageUrl('p1', { status: 'AUTO_MATCHED', imageUrl: 'https://x.invalid/a.jpg' }) === 'https://x.invalid/a.jpg', 'AUTO_MATCHED => URL');
  ok(displayImageUrl('p1', { status: 'VERIFIED', imageUrl: 'https://x.invalid/a.jpg' }) === 'https://x.invalid/a.jpg', 'VERIFIED => URL');
  ok(displayImageUrl('p1', { status: 'MANUAL_UPLOAD', imageUrl: null }) === '/products/p1/image/file', 'MANUAL_UPLOAD => own file endpoint');
  ok(displayImageUrl('p1', { status: 'NOT_FOUND', imageUrl: null }) === null && displayImageUrl('p1', null) === null, 'NOT_FOUND / no row => null');

  const prisma = new PrismaService();
  await prisma.$connect();
  const manager = await prisma.user.findFirstOrThrow({ where: { role: Role.WAREHOUSE_MANAGER, active: true } });
  const branchUser = await prisma.user.findFirstOrThrow({ where: { role: Role.BRANCH_USER, active: true } });
  const mgr = await login(manager.email);
  const branch = await login(branchUser.email);

  const suffix = Date.now();
  const product = await prisma.product.create({ data: { sku: `IMG-DISP-${suffix}`, name: `ImgDisplay Test ${suffix}`, category: 'Misc', unit: 'pc', unitPrice: 1 } });
  const candidateUrl = 'https://images.example.invalid/candidate.jpg';
  const listed = async () => ((await api(mgr, '/products')).data as { id: string; image?: { status: string; imageUrl: string | null; confidence: number | null } | null }[]).find((p) => p.id === product.id);

  try {
    await prisma.productImage.create({ data: { productId: product.id, status: 'FOUND_NEEDS_REVIEW', imageUrl: candidateUrl, confidence: 49, source: 'open_food_facts', fetchedAt: new Date() } });

    console.log('\n== FOUND_NEEDS_REVIEW candidate: pending, not displayable ==');
    let p = await listed();
    ok(p?.image?.status === 'FOUND_NEEDS_REVIEW' && p.image.confidence === 49, 'GET /products keeps status + confidence so the UI can flag it as pending');
    ok(p?.image?.imageUrl === null, 'GET /products does NOT expose the unreviewed image URL');
    const detail = await api(mgr, `/products/${product.id}`);
    ok(detail.data?.image?.status === 'FOUND_NEEDS_REVIEW' && detail.data?.image?.imageUrl === null, 'GET /products/:id does not expose it either');
    const asBranch = await api(branch, '/products/availability');
    const branchRow = (asBranch.data as { productId: string; image: unknown }[]).find((r) => r.productId === product.id);
    ok(branchRow === undefined || branchRow.image === null, 'branch catalog still shows no image for it (unchanged)');

    console.log('\n== the review workflow is unchanged ==');
    const panel = await api(mgr, `/products/${product.id}/image`);
    ok(panel.status === 200 && panel.data?.status === 'FOUND_NEEDS_REVIEW' && panel.data?.imageUrl === candidateUrl, "the manager's review panel endpoint still returns the candidate to review");
    const approve = await api(mgr, `/products/${product.id}/image/approve`, 'POST');
    ok(approve.status === 201 && approve.data?.status === 'VERIFIED', 'approving still works and marks it VERIFIED');
    p = await listed();
    ok(p?.image?.status === 'VERIFIED' && p.image.imageUrl === candidateUrl, 'once approved, the list shows the image');

    console.log('\n== other statuses display as before ==');
    await prisma.productImage.update({ where: { productId: product.id }, data: { status: 'AUTO_MATCHED', verifiedById: null, verifiedAt: null } });
    p = await listed();
    ok(p?.image?.imageUrl === candidateUrl, 'AUTO_MATCHED still displays');
    await prisma.productImage.update({ where: { productId: product.id }, data: { status: 'MANUAL_UPLOAD', imageUrl: null, imageData: new Uint8Array([1, 2, 3]), imageMimeType: 'image/png' } });
    p = await listed();
    ok(p?.image?.imageUrl === `/products/${product.id}/image/file`, 'MANUAL_UPLOAD still displays via its own file endpoint');
    await prisma.productImage.update({ where: { productId: product.id }, data: { status: 'NOT_FOUND', imageUrl: null, imageData: null, imageMimeType: null } });
    p = await listed();
    ok(p?.image?.status === 'NOT_FOUND' && p.image.imageUrl === null, 'NOT_FOUND has no image (placeholder)');
  } finally {
    await prisma.productImage.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.$disconnect();
  }

  console.log(`\n${fail === 0 ? '✅ All checks passed.' : `❌ ${fail} check(s) failed.`} (${pass} passed, ${fail} failed)`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('CRASHED:', err);
  process.exit(1);
});
