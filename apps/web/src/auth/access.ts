/**
 * Which roles may open which pages. ONE table, used by both the sidebar (what is shown) and the route guard in App.tsx
 * (what can be opened by typing a URL). This only decides what the browser offers: the API still enforces every rule
 * on every request, so removing a guard here never exposes data.
 */
export type RoleName = 'SUPER_ADMIN' | 'WAREHOUSE_MANAGER' | 'BRANCH_USER' | 'DRIVER'

const MANAGERS: RoleName[] = ['SUPER_ADMIN', 'WAREHOUSE_MANAGER']

/** First matching prefix wins; '/' must be matched exactly. `null` = any signed-in user. */
export const ROUTE_ACCESS: { prefix: string; roles: RoleName[] | null }[] = [
  { prefix: '/inventory', roles: MANAGERS },
  { prefix: '/products', roles: MANAGERS },
  { prefix: '/branches', roles: MANAGERS },
  { prefix: '/stock-intake', roles: MANAGERS },
  { prefix: '/transfers', roles: MANAGERS },
  { prefix: '/documents', roles: MANAGERS },
  { prefix: '/activity', roles: MANAGERS },
  { prefix: '/users', roles: MANAGERS },
  { prefix: '/requests', roles: [...MANAGERS, 'BRANCH_USER'] },
  { prefix: '/deliveries', roles: [...MANAGERS, 'DRIVER'] },
  { prefix: '/shop', roles: ['BRANCH_USER'] },
]

export function canAccessPath(role: RoleName | undefined | null, pathname: string): boolean {
  if (!role) return false
  const hit = ROUTE_ACCESS.find((r) => pathname === r.prefix || pathname.startsWith(r.prefix + '/'))
  if (!hit || hit.roles === null) return true // '/', /change-password and anything unknown (unknown paths are redirected separately)
  return hit.roles.includes(role)
}
