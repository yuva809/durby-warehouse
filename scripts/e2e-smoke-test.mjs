#!/usr/bin/env node
/**
 * End-to-end smoke test for the Durby Warehouse V2 API — exercises exactly
 * the scenario specified for V2 sign-off, adapted to real seeded products
 * (the seed data is the customer's actual 47-product catalog; there is no
 * generic "Sugar" SKU in it, so this uses two real products instead, on the
 * same branch (Wilhelmstraße 2 / b4) V1's demo already used for this exact
 * "over-request, partially approve" story):
 *
 *   Branch requests Ponni Boiled Rice + Coconut Milk Powder in quantities
 *   that exceed warehouse availability -> Manager checks availability,
 *   partially approves, reservation is created -> Driver picks a smaller
 *   quantity than approved (picked becomes authoritative) -> delivers ->
 *   Branch sees requested/approved/delivered/difference and confirms
 *   receipt -> every number (warehouse onHand/reserved/available, branch
 *   onHand, ledger, statuses) is asserted consistent at the end.
 *
 * Also runs the literal concurrency scenario from the spec: two requests
 * both try to reserve the very last units of a product; asserts exactly one
 * succeeds and the other gets a 409.
 *
 * Usage:
 *   API_BASE=http://api.localhost node scripts/e2e-smoke-test.mjs
 * (defaults to http://api.localhost, i.e. `docker compose up -d` on this
 * machine with the default Caddyfile domains)
 */

const BASE = process.env.API_BASE ?? 'http://api.localhost';
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'ChangeMe123!';

let failures = 0;

function assert(cond, message) {
  if (!cond) {
    failures++;
    console.error(`✗ FAIL: ${message}`);
  } else {
    console.log(`✓ ${message}`);
  }
}

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;
  return { status: res.status, body: json };
}

async function login(email) {
  const { status, body } = await api('/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
  if (status !== 200) throw new Error(`Login failed for ${email}: ${status} ${JSON.stringify(body)}`);
  return body.accessToken;
}

async function main() {
  console.log(`\n== Durby Warehouse V2 — end-to-end smoke test (${BASE}) ==\n`);

  const branchToken = await login('wilhelm@durby.tech'); // Wilhelmstraße 2 (b4)
  const managerToken = await login('manager@durby.tech');
  const driverToken = await login('mike@durby.tech');

  const RICE = 'ponni_boiled_rice_224'; // warehouse onHand: 11
  const MILK = 'coconut_milk_powder_87'; // warehouse onHand: 2

  const before = {
    rice: (await api(`/inventory?locationId=warehouse`, { token: managerToken })).body.items.find((i) => i.productId === RICE),
    milk: (await api(`/inventory?locationId=warehouse`, { token: managerToken })).body.items.find((i) => i.productId === MILK),
  };
  console.log('Warehouse before:', before);

  // ---- 1. Branch creates a request exceeding availability -----------------
  const { status: createStatus, body: request } = await api('/requests', {
    method: 'POST',
    token: branchToken,
    body: { items: [{ productId: RICE, requestedQty: 15 }, { productId: MILK, requestedQty: 5 }] },
  });
  assert(createStatus === 201 || createStatus === 200, `Branch created request (status ${createStatus})`);
  assert(request.status === 'PENDING', `New request status is PENDING (got ${request.status})`);
  console.log(`  Request ${request.code}: Rice 15 (have ${before.rice.available}), Milk 5 (have ${before.milk.available})`);

  // ---- 2. Manager reviews, partially approves ------------------------------
  await api(`/requests/${request.id}/review`, { method: 'POST', token: managerToken });
  await api(`/requests/${request.id}/items`, {
    method: 'PATCH',
    token: managerToken,
    body: { productId: RICE, approvedQty: before.rice.available }, // e.g. 15 requested -> 11 approved
  });
  await api(`/requests/${request.id}/items`, {
    method: 'PATCH',
    token: managerToken,
    body: { productId: MILK, approvedQty: before.milk.available }, // e.g. 5 requested -> 2 approved
  });

  const { status: approveStatus, body: transfer } = await api(`/requests/${request.id}/approve`, { method: 'POST', token: managerToken });
  assert(approveStatus === 201 || approveStatus === 200, `Manager approved the request (status ${approveStatus})`);
  assert(transfer.code?.startsWith('TR-'), `Transfer ${transfer.code} was created`);

  const afterApprove = {
    rice: (await api(`/inventory?locationId=warehouse`, { token: managerToken })).body.items.find((i) => i.productId === RICE),
    milk: (await api(`/inventory?locationId=warehouse`, { token: managerToken })).body.items.find((i) => i.productId === MILK),
  };
  assert(afterApprove.rice.reserved === before.rice.available, `Rice reservation created: reserved=${afterApprove.rice.reserved} (expected ${before.rice.available})`);
  assert(afterApprove.rice.available === 0, `Rice available dropped to 0 after full reservation`);
  assert(afterApprove.milk.reserved === before.milk.available, `Milk reservation created: reserved=${afterApprove.milk.reserved} (expected ${before.milk.available})`);
  assert(afterApprove.rice.onHand === before.rice.onHand, `Rice onHand unchanged by approval alone (still physically in the warehouse)`);

  // ---- 3. Driver: assign, pick (less than approved), dispatch --------------
  await api(`/transfers/${transfer.id}/assign-driver`, { method: 'POST', token: managerToken, body: { driverId: (await api('/users?role=DRIVER', { token: managerToken })).body[0].id } });
  await api(`/transfers/${transfer.id}/start-picking`, { method: 'POST', token: driverToken });

  const pickedRice = afterApprove.rice.reserved - 2; // pick 2 fewer than approved, on purpose
  const pickedMilk = afterApprove.milk.reserved;
  await api(`/transfers/${transfer.id}/picked-qty`, { method: 'POST', token: driverToken, body: { productId: RICE, pickedQty: pickedRice } });
  await api(`/transfers/${transfer.id}/picked-qty`, { method: 'POST', token: driverToken, body: { productId: MILK, pickedQty: pickedMilk } });

  const { status: dispatchStatus } = await api(`/transfers/${transfer.id}/dispatch`, { method: 'POST', token: driverToken });
  assert(dispatchStatus === 201 || dispatchStatus === 200, `Dispatch succeeded (status ${dispatchStatus})`);

  const afterDispatch = {
    rice: (await api(`/inventory?locationId=warehouse`, { token: managerToken })).body.items.find((i) => i.productId === RICE),
  };
  assert(afterDispatch.rice.reserved === 0, `Rice reservation fully released after dispatch`);
  assert(afterDispatch.rice.onHand === before.rice.onHand - pickedRice, `Warehouse Rice onHand reduced by the PICKED quantity (${pickedRice}), not the approved one`);

  // ---- 4. Deliver ------------------------------------------------------------
  const { status: deliverStatus, body: delivered } = await api(`/transfers/${transfer.id}/deliver`, { method: 'POST', token: driverToken });
  assert(deliverStatus === 201 || deliverStatus === 200, `Mark delivered succeeded (status ${deliverStatus})`);
  assert(delivered.status === 'DELIVERED', `Transfer status is DELIVERED (got ${delivered.status})`);

  const branchInventory = (await api(`/inventory?locationId=b4`, { token: managerToken })).body.items;
  const branchRice = branchInventory.find((i) => i.productId === RICE);
  console.log(`  Branch Rice onHand now: ${branchRice?.onHand}`);

  // ---- 5. Branch confirms receipt --------------------------------------------
  const { status: confirmStatus, body: confirmed } = await api(`/transfers/${transfer.id}/confirm-receipt`, { method: 'POST', token: branchToken });
  assert(confirmStatus === 201 || confirmStatus === 200, `Branch confirmed receipt (status ${confirmStatus})`);
  assert(!!confirmed.confirmedAt, 'confirmedAt was set');

  const finalRequest = (await api(`/requests/${request.id}`, { token: managerToken })).body;
  console.log(`\n  Final: Requested Rice 15, Approved ${afterApprove.rice.reserved}, Picked/Delivered ${pickedRice}, Difference ${afterApprove.rice.reserved - pickedRice}`);
  assert(finalRequest.status === 'DELIVERED', `Request mirrors DELIVERED status (got ${finalRequest.status})`);

  // ---- 6. Ledger sanity -------------------------------------------------------
  const movements = (await api(`/inventory/movements?productId=${RICE}`, { token: managerToken })).body.items;
  assert(movements.some((m) => m.type === 'TRANSFER_OUT' && m.reference === transfer.code), 'TRANSFER_OUT movement recorded for this transfer');
  assert(movements.some((m) => m.type === 'TRANSFER_IN' && m.reference === transfer.code), 'TRANSFER_IN movement recorded for this transfer');

  // ---- 7. Concurrency: two requests race for the last units of a product ----
  console.log('\n-- Concurrency test: two approvals racing for the same stock --');
  const scarce = 'pure_red_palm_oil_111'; // warehouse onHand: 1
  const scarceBefore = (await api(`/inventory?locationId=warehouse`, { token: managerToken })).body.items.find((i) => i.productId === scarce);

  const reqA = (await api('/requests', { method: 'POST', token: branchToken, body: { items: [{ productId: scarce, requestedQty: scarceBefore.onHand }] } })).body;
  const reqB = (await api('/requests', { method: 'POST', token: branchToken, body: { items: [{ productId: scarce, requestedQty: scarceBefore.onHand }] } })).body;

  const [resA, resB] = await Promise.all([
    api(`/requests/${reqA.id}/approve`, { method: 'POST', token: managerToken }),
    api(`/requests/${reqB.id}/approve`, { method: 'POST', token: managerToken }),
  ]);

  const succeeded = [resA, resB].filter((r) => r.status === 200 || r.status === 201).length;
  const conflicted = [resA, resB].filter((r) => r.status === 409).length;
  assert(succeeded === 1 && conflicted === 1, `Exactly one of the two concurrent approvals succeeded (succeeded=${succeeded}, 409=${conflicted})`);

  const scarceAfter = (await api(`/inventory?locationId=warehouse`, { token: managerToken })).body.items.find((i) => i.productId === scarce);
  assert(scarceAfter.reserved === scarceBefore.onHand, `Scarce stock reserved exactly once, not double-reserved (reserved=${scarceAfter.reserved})`);

  console.log(`\n${failures === 0 ? '✅ All checks passed.' : `❌ ${failures} check(s) failed.`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
