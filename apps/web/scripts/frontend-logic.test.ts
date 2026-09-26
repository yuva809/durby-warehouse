/**
 * Regression tests for the frontend pieces that are pure logic (no browser, no dependencies):
 *   - the role -> page access table behind the sidebar AND the route guard
 *   - warehouse lookup by real location data (never a fixed id)
 *   - a static guard: the hard-coded warehouse id must not come back
 * The behaviour of the rendered pages is covered by the Playwright end-to-end run (see the audit report).
 *
 * Run with: npm run test:logic   (Node 22 strips the types itself; nothing to install)
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { canAccessPath, ROUTE_ACCESS } from '../src/auth/access.ts'
import { pickWarehouse } from '../src/lib/warehouse.ts'

let pass = 0
let fail = 0
function ok(cond: boolean, label: string) {
  if (cond) { pass++; console.log(`✓ ${label}`) } else { fail++; console.log(`✗ FAIL: ${label}`) }
}
function check(label: string, fn: () => void) {
  try { fn(); pass++; console.log(`✓ ${label}`) } catch (e) { fail++; console.log(`✗ FAIL: ${label}\n    ${(e as Error).message.split('\n')[0]}`) }
}

console.log('== route access ==')
const ADMIN = 'SUPER_ADMIN', MGR = 'WAREHOUSE_MANAGER', BRANCH = 'BRANCH_USER', DRIVER = 'DRIVER'
const matrix: Record<string, [boolean, boolean, boolean, boolean]> = {
  //                      admin  mgr    branch driver
  '/':                   [true,  true,  true,  true],
  '/change-password':    [true,  true,  true,  true],
  '/inventory':          [true,  true,  false, false],
  '/products':           [true,  true,  false, false],
  '/branches':           [true,  true,  false, false],
  '/branches/abc123':    [true,  true,  false, false],
  '/stock-intake':       [true,  true,  false, false],
  '/stock-intake/xyz':   [true,  true,  false, false],
  '/transfers':          [true,  true,  false, false],
  '/documents':          [true,  true,  false, false],
  '/activity':           [true,  true,  false, false],
  '/users':              [true,  true,  false, false],
  '/requests':           [true,  true,  true,  false],
  '/deliveries':         [true,  true,  false, true],
  '/shop':               [false, false, true,  false],
  '/shop/cart':          [false, false, true,  false],
  '/shop/some-category': [false, false, true,  false],
}
for (const [path, want] of Object.entries(matrix)) {
  check(`${path}: admin ${want[0]}, manager ${want[1]}, branch ${want[2]}, driver ${want[3]}`, () => {
    assert.equal(canAccessPath(ADMIN, path), want[0])
    assert.equal(canAccessPath(MGR, path), want[1])
    assert.equal(canAccessPath(BRANCH, path), want[2])
    assert.equal(canAccessPath(DRIVER, path), want[3])
  })
}
ok(!canAccessPath(undefined, '/'), 'a signed-out visitor has no access to anything')
ok(canAccessPath(BRANCH, '/inventory-report') === true, '"/inventory-report" is NOT treated as "/inventory" (prefix match respects path segments)')
ok(ROUTE_ACCESS.every((r) => r.prefix.startsWith('/') && (r.roles === null || r.roles.length > 0)), 'every rule is well-formed')
ok(ROUTE_ACCESS.filter((r) => r.roles?.includes(DRIVER)).map((r) => r.prefix).join() === '/deliveries', 'a driver can reach exactly one section: /deliveries')
ok(!ROUTE_ACCESS.some((r) => r.prefix.includes('roadmap')), 'no Roadmap route exists')

console.log('\n== warehouse lookup ==')
const loc = (id: string, type: string, active = true) => ({ id, type, active })
ok(pickWarehouse(undefined) === undefined && pickWarehouse([]) === undefined, 'no locations yet: no warehouse (the UI shows "not set up")')
ok(pickWarehouse([loc('b1', 'BRANCH'), loc('b2', 'BRANCH')]) === undefined, 'only branches: no warehouse')
check('a real generated id is used as-is', () => assert.equal(pickWarehouse([loc('b1', 'BRANCH'), loc('cmuh2x9k400001abc', 'WAREHOUSE')])?.id, 'cmuh2x9k400001abc'))
ok(pickWarehouse([loc('warehouse', 'BRANCH')]) === undefined, 'a location that merely has the id "warehouse" is not a warehouse unless its TYPE says so')
ok(pickWarehouse([loc('old', 'WAREHOUSE', false)]) === undefined, 'a deactivated warehouse is not "the" warehouse')
check('an inactive old warehouse is skipped in favour of the active one', () => assert.equal(pickWarehouse([loc('old', 'WAREHOUSE', false), loc('new', 'WAREHOUSE')])?.id, 'new'))
check('the demo seed id still works because it is looked up by type, not assumed', () => assert.equal(pickWarehouse([loc('warehouse', 'WAREHOUSE')])?.id, 'warehouse'))

console.log('\n== static guard: no hard-coded warehouse id in the frontend ==')
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) ? [p] : [] })
}
const files = walk(new URL('../src', import.meta.url).pathname)
const offenders: string[] = []
for (const f of files) {
  const t = readFileSync(f, 'utf8')
  if (/\bWAREHOUSE_ID\b/.test(t) || /(===|!==|==)\s*['"]warehouse['"]/.test(t) || /['"]warehouse['"]\s*(===|!==)/.test(t) || /useInventory\(\s*['"]/.test(t)) offenders.push(f.split('/src/')[1])
}
ok(offenders.length === 0, `no WAREHOUSE_ID / comparison against the literal id "warehouse" in ${files.length} source files`)
if (offenders.length) console.log('   offenders:', offenders.join(', '))
ok(!/WAREHOUSE_ID/.test(readFileSync(new URL('../src/types/index.ts', import.meta.url), 'utf8')), 'the constant is gone from types/index.ts')

console.log(`\n${fail === 0 ? '✅ All checks passed.' : `❌ ${fail} check(s) failed.`} (${pass} passed, ${fail} failed)`)
process.exit(fail === 0 ? 0 : 1)
