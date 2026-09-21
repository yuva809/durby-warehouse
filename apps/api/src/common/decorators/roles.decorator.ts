import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to the given roles. Enforced by RolesGuard, which runs
 * after JwtAuthGuard on every route in the app (see AppModule's APP_GUARD
 * providers) — there is no route that is "protected by omission" here, only
 * routes explicitly marked @Public() skip auth entirely.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
