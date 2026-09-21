import type { AuthUser } from '../types'

export function isBranchUser(user: AuthUser | null): boolean {
  return user?.role === 'BRANCH_USER'
}

export function isManager(user: AuthUser | null): boolean {
  return user?.role === 'SUPER_ADMIN' || user?.role === 'WAREHOUSE_MANAGER'
}

export function isDriver(user: AuthUser | null): boolean {
  return user?.role === 'DRIVER'
}

export const ROLE_LABEL: Record<AuthUser['role'], string> = {
  SUPER_ADMIN: 'Super Admin',
  WAREHOUSE_MANAGER: 'Warehouse Manager',
  BRANCH_USER: 'Branch',
  DRIVER: 'Driver',
}
