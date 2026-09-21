import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marks a route as not requiring authentication (e.g. /health, /auth/login). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
