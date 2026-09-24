/**
 * No production fallback secret exists anywhere in this app on purpose —
 * a silently-used, in-source default would mean every deployment that
 * forgets to set JWT_SECRET issues forgeable tokens without any error.
 * Call this wherever the JWT secret is needed; it throws instead of
 * returning a fallback, which — called from a Nest provider factory or a
 * PassportStrategy constructor — fails application bootstrap outright.
 */
export function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length < 32) {
    throw new Error(
      'JWT_SECRET is missing or too short (must be at least 32 characters — generate one with `openssl rand -base64 48`). Refusing to start.',
    );
  }
  return secret;
}
