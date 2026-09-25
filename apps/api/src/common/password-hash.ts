import * as bcrypt from 'bcryptjs';

/** The one bcrypt work factor for every stored password (login, change, reset, and the server-console CLIs). */
export const BCRYPT_COST = 10;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}
