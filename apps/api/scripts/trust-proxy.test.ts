/**
 * Tests for src/common/trust-proxy.ts — no database or Docker needed.
 *   1. parseTrustProxy(): accepts only literal IPs/CIDRs, rejects everything
 *      that would widen trust (true, keywords, hop counts, /0, junk).
 *   2. Real Express (the same version the API runs) with the SAME
 *      configureTrustProxy() the app bootstrap calls: whether req.ip honors
 *      X-Forwarded-For depends solely on whether the direct peer is listed
 *      in TRUST_PROXY, and a forged left-hand entry is never believed.
 *
 * The live, through-Caddy version of these checks (distinct client IPs,
 * spoofed headers, direct requests) is scripts/rate-limit-proxy-test.sh at
 * the repo root.
 *
 * Run with: npm run test:trust-proxy
 */
import express from 'express';
import type { AddressInfo } from 'node:net';
import { configureTrustProxy, parseTrustProxy } from '../src/common/trust-proxy';

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
function throws(fn: () => unknown) {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

async function ipSeenBy(trustProxy: string | undefined, headers: Record<string, string>): Promise<string> {
  const app = express();
  configureTrustProxy(app, trustProxy);
  app.get('/ip', (req, res) => {
    res.json({ ip: req.ip });
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/ip`, { headers });
    return ((await res.json()) as { ip: string }).ip.replace(/^::ffff:/, '');
  } finally {
    await new Promise((r) => server.close(r));
  }
}

async function main() {
  console.log('== parseTrustProxy: accepted values ==');
  ok(parseTrustProxy(undefined) === false, 'unset => trust nothing');
  ok(parseTrustProxy('') === false && parseTrustProxy('   ') === false, 'empty/blank => trust nothing');
  ok(JSON.stringify(parseTrustProxy('172.28.0.10')) === '["172.28.0.10"]', 'a single IPv4 address');
  ok(JSON.stringify(parseTrustProxy(' 172.28.0.10 , 10.0.0.0/24 ')) === '["172.28.0.10","10.0.0.0/24"]', 'a list with a CIDR, whitespace tolerated');
  ok(JSON.stringify(parseTrustProxy('::1')) === '["::1"]', 'a single IPv6 address');

  console.log('\n== parseTrustProxy: rejected values (each would widen trust or is malformed) ==');
  for (const bad of ['true', 'false', '1', '2', 'loopback', 'uniquelocal', 'linklocal', '0.0.0.0/0', '::/0', '172.28.0.10/0', '172.28.0.10/33', '10.0.0.0/abc', '172.28.0.10/24/8', 'proxy.example.com', '172.28.0.10,,nope']) {
    ok(throws(() => parseTrustProxy(bad)), `rejects "${bad}"`);
  }

  console.log('\n== Express req.ip with the app\'s own configuration ==');
  // The test client connects from 127.0.0.1, so "127.0.0.1" plays the trusted Caddy here.
  const forged = { 'X-Forwarded-For': '203.0.113.7' };
  ok((await ipSeenBy('127.0.0.1', forged)) === '203.0.113.7', 'peer IS the trusted proxy => real client IP taken from X-Forwarded-For');
  ok((await ipSeenBy('127.0.0.1', { 'X-Forwarded-For': '6.6.6.6, 203.0.113.7' })) === '203.0.113.7', 'trusted proxy appended the real client: a forged left-hand entry is ignored');
  ok((await ipSeenBy('127.0.0.1', { 'X-Forwarded-For': '6.6.6.6, 7.7.7.7, 203.0.113.7' })) === '203.0.113.7', 'several forged entries in front of the real one are ignored');
  ok((await ipSeenBy('172.28.0.10', forged)) === '127.0.0.1', 'peer is NOT the trusted proxy (direct/untrusted request) => X-Forwarded-For ignored, direct peer used');
  ok((await ipSeenBy(undefined, forged)) === '127.0.0.1', 'TRUST_PROXY unset => X-Forwarded-For ignored');
  ok((await ipSeenBy('127.0.0.1', {})) === '127.0.0.1', 'trusted proxy but no header => falls back to the peer');

  console.log(`\n${fail === 0 ? '✅ All checks passed.' : `❌ ${fail} check(s) failed.`} (${pass} passed, ${fail} failed)`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('CRASHED:', err);
  process.exit(1);
});
