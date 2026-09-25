export const MIN_PASSWORD_LENGTH = 12;
/** bcrypt only uses the first 72 bytes; anything longer would be silently truncated, so it is refused instead. */
export const MAX_PASSWORD_BYTES = 72;

// Anything ever published in this repo/docs, or trivially guessable: never acceptable.
const KNOWN_WEAK = ['changeme123!', 'change-me-to-a-long-random-value', 'password1234', 'administrator', 'welcome12345', 'qwerty123456'];

/**
 * Policy for passwords a USER chooses (change / reset). Returns the list of
 * problems (empty = acceptable). Never includes the password in a message.
 * Deliberately length-based rather than composition rules: 12+ characters,
 * no known defaults, nothing derived from the account's email.
 */
export function passwordPolicyProblems(password: string, email?: string): string[] {
  const problems: string[] = [];
  if (password.length < MIN_PASSWORD_LENGTH) problems.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) problems.push(`Password must be at most ${MAX_PASSWORD_BYTES} bytes.`);
  if (KNOWN_WEAK.includes(password.toLowerCase())) problems.push('That password is a known default or placeholder and cannot be used.');
  if (new Set(password).size < 5) problems.push('Password is too repetitive.');
  const localPart = (email ?? '').split('@')[0].toLowerCase();
  if (localPart.length >= 3 && password.toLowerCase().includes(localPart)) problems.push('Password must not contain your email name.');
  return problems;
}
