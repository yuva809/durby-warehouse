import type { ViewerRole } from '../types'
import { BRANCH_IDS } from '../types'
import { LOCATIONS } from '../data/seed'

export interface RoleMeta {
  id: ViewerRole
  label: string
  group: 'Overview' | 'Warehouse' | 'Branches' | 'Delivery'
  branchId?: string
}

function branchLabel(branchId: string): string {
  return LOCATIONS.find((l) => l.id === branchId)?.name ?? branchId
}

export const ROLES: RoleMeta[] = [
  { id: 'overview', label: 'Overview', group: 'Overview' },
  { id: 'warehouse_manager', label: 'Warehouse Manager', group: 'Warehouse' },
  ...BRANCH_IDS.map((id) => ({
    id: id as ViewerRole,
    label: branchLabel(id),
    group: 'Branches' as const,
    branchId: id as string,
  })),
  { id: 'delivery_person', label: 'Delivery Person', group: 'Delivery' },
]

export function roleMeta(role: ViewerRole): RoleMeta {
  return ROLES.find((r) => r.id === role) ?? ROLES[0]
}

export function branchIdForRole(role: ViewerRole): string | undefined {
  return roleMeta(role).branchId
}
