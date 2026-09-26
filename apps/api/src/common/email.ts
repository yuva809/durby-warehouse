/**
 * Emails are stored and looked up in one canonical form (trimmed, lower-case) so that
 * "Owner@Company.com" and "owner@company.com" can never become two accounts, and a user
 * who types their address with a capital letter can still sign in.
 */
export function normalizeEmail(email: string): string {
  return (email ?? '').trim().toLowerCase();
}
