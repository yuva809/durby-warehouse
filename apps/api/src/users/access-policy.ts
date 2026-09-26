import { Role } from '@prisma/client';

/**
 * WHO may manage WHOM: the single source of truth for every user-management action
 * (invite, edit, deactivate, reactivate, resend/revoke, reset password, sign out
 * everywhere, assign branch). Pure functions, no I/O, so the matrix is easy to read and test.
 *
 *  - SUPER_ADMIN manages every role. Only a SUPER_ADMIN can create another SUPER_ADMIN.
 *  - WAREHOUSE_MANAGER manages only BRANCH_USER and DRIVER (the existing model: managers
 *    dispatch drivers). Never a SUPER_ADMIN or another WAREHOUSE_MANAGER, never themselves.
 *  - BRANCH_USER and DRIVER manage nobody.
 */
const MANAGER_MANAGES: Role[] = [Role.BRANCH_USER, Role.DRIVER];

export function canManageRole(callerRole: Role, targetRole: Role): boolean {
  if (callerRole === Role.SUPER_ADMIN) return true;
  if (callerRole === Role.WAREHOUSE_MANAGER) return MANAGER_MANAGES.includes(targetRole);
  return false;
}

/** The roles a caller may hand out when inviting or creating an account. */
export function invitableRoles(callerRole: Role): Role[] {
  if (callerRole === Role.SUPER_ADMIN) return [Role.WAREHOUSE_MANAGER, Role.BRANCH_USER, Role.DRIVER, Role.SUPER_ADMIN];
  if (callerRole === Role.WAREHOUSE_MANAGER) return [...MANAGER_MANAGES];
  return [];
}
