import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ALLOW_PASSWORD_CHANGE_REQUIRED_KEY } from '../decorators/allow-password-change.decorator';

/**
 * Server-side enforcement of "you must choose your own password first". An
 * admin-created account starts with a password somebody else knew, so until
 * it is changed the account can do nothing except change it: a client that
 * ignores the flag still can't reach any data. Runs after JwtAuthGuard.
 */
@Injectable()
export class PasswordChangeRequiredGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(ALLOW_PASSWORD_CHANGE_REQUIRED_KEY, targets)) return true;
    const { user } = context.switchToHttp().getRequest();
    if (user?.passwordChangeRequired) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'You must choose a new password before you can continue.',
      });
    }
    return true;
  }
}
