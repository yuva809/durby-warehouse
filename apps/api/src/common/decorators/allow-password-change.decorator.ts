import { SetMetadata } from '@nestjs/common';

export const ALLOW_PASSWORD_CHANGE_REQUIRED_KEY = 'allowPasswordChangeRequired';

/**
 * Marks the few authenticated routes a user whose password change is still
 * pending may call (change-password itself and /auth/me). Every other route
 * is refused by PasswordChangeRequiredGuard until they have chosen a password.
 */
export const AllowPasswordChangeRequired = () => SetMetadata(ALLOW_PASSWORD_CHANGE_REQUIRED_KEY, true);
