import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Role } from '@prisma/client';

export interface AuthUser {
  userId: string;
  email: string;
  role: Role;
  locationId: string | null;
  /** Set by JwtStrategy; true until the user has chosen their own password (see PasswordChangeRequiredGuard). */
  passwordChangeRequired?: boolean;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
