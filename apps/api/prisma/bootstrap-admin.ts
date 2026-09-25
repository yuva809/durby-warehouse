/**
 * One-time production bootstrap: creates the FIRST real administrator
 * (SUPER_ADMIN) and nothing else — no demo users, branches or products.
 * This is the only way a first admin can exist: every API route that creates
 * users requires an authenticated SUPER_ADMIN/WAREHOUSE_MANAGER, and there is
 * deliberately no public admin-creation endpoint.
 *
 *   docker compose exec -e ADMIN_EMAIL=you@company.com -e "ADMIN_NAME=Your Name" \
 *     backend npm run bootstrap:admin
 *
 * Inputs
 *   ADMIN_EMAIL  required, must already be lowercase (login is a case-sensitive exact match)
 *   ADMIN_NAME   required
 *   password     typed at a hidden, confirmed prompt when run in a terminal (the
 *                default for `docker compose exec`). For non-interactive use only:
 *                ADMIN_PASSWORD in the environment, plus BOOTSTRAP_CONFIRM_DB=<database name>.
 *                The password is never logged or echoed, and only its bcrypt hash is stored.
 *
 * Safety
 *   - Refuses unless the database has ZERO users. Not just "no admin": a
 *     database that already has any user (demo-seeded, restored from a backup,
 *     or half-configured) is left completely untouched. So a rerun is a
 *     harmless no-op that exits non-zero, and two operators running it at once
 *     cannot both succeed (an advisory lock serializes the check-and-create).
 *   - Requires migrations to be applied (`prisma migrate deploy`) first.
 *   - Asks you to confirm the target database before writing anything.
 */
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as readline from 'node:readline';

// Must match AuthService.hashPassword (cost 10). Not imported: the production
// image ships only compiled dist/ and prisma/, not src/.
const BCRYPT_COST = 10;
const MIN_PASSWORD_LENGTH = 12;
// Serializes concurrent bootstrap runs (arbitrary constant, unique to this command).
const BOOTSTRAP_LOCK_KEY = 7_710_204_001;

// Anything ever published in this repo or its docs must never be an admin password.
const KNOWN_WEAK_PASSWORDS = ['changeme123!', 'change-me-to-a-long-random-value', 'password1234', 'administrator', 'welcome12345', 'qwerty123456'];

class BootstrapError extends Error {
  constructor(
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
  }
}

/** Non-secret inputs. Pure: no DB, no I/O — so it's unit-testable. */
export function validateIdentity(email: string | undefined, name: string | undefined): string[] {
  const problems: string[] = [];
  if (!email) problems.push('ADMIN_EMAIL is required.');
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push('ADMIN_EMAIL is not a valid email address.');
  else if (email !== email.toLowerCase()) problems.push('ADMIN_EMAIL must be lowercase (login matches the email exactly, so a mixed-case address could never log in).');
  if (!name || !name.trim()) problems.push('ADMIN_NAME is required.');
  return problems;
}

/** Pure password policy. Never logs or returns the password itself. */
export function validatePassword(email: string | undefined, password: string): string[] {
  const problems: string[] = [];
  if (password.length < MIN_PASSWORD_LENGTH) problems.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  const localPart = (email ?? '').split('@')[0].toLowerCase();
  if (localPart.length >= 3 && password.toLowerCase().includes(localPart)) problems.push('Password must not contain the email address name.');
  if (KNOWN_WEAK_PASSWORDS.includes(password.toLowerCase())) problems.push('That password is a known default/placeholder and cannot be used.');
  if (new Set(password).size < 5) problems.push('Password is too repetitive.');
  return problems;
}

/** Reads a line from the terminal without echoing it. */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    const chars: string[] = [];
    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    const onKey = (str: string | undefined, key: { name?: string; ctrl?: boolean }) => {
      if (key?.ctrl && key.name === 'c') {
        cleanup();
        reject(new BootstrapError('Cancelled.', 130));
      } else if (key?.name === 'return' || key?.name === 'enter') {
        cleanup();
        process.stdout.write('\n');
        resolve(chars.join(''));
      } else if (key?.name === 'backspace') {
        chars.pop();
      } else if (str && !key?.ctrl) {
        chars.push(str);
      }
    };
    const cleanup = () => {
      stdin.off('keypress', onKey);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.on('keypress', onKey);
  });
}

function promptVisible(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a); }));
}

/** Host + database name only — never the credentials part of the URL. */
function describeTarget(): { database: string; host: string } {
  try {
    const url = new URL(process.env.DATABASE_URL ?? '');
    return { database: url.pathname.replace(/^\//, ''), host: url.hostname };
  } catch {
    return { database: '(unknown)', host: '(unknown)' };
  }
}

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim();
  const name = process.env.ADMIN_NAME?.trim();
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const target = describeTarget();

  if (!process.env.DATABASE_URL) throw new BootstrapError('DATABASE_URL is not set.');

  // Password: prompt when interactive, otherwise the environment (automation only).
  let password: string;
  if (interactive) {
    // Check the non-secret inputs first so the operator isn't asked for a password that can't be used.
    const early = validateIdentity(email, name);
    if (early.length) throw new BootstrapError(early.map((p) => `- ${p}`).join('\n'));
    password = await promptHidden(`Password for ${email} (min ${MIN_PASSWORD_LENGTH} characters, not shown): `);
    const again = await promptHidden('Repeat password: ');
    if (password !== again) throw new BootstrapError('Passwords did not match. Nothing was created.');
  } else {
    if (!process.env.ADMIN_PASSWORD) {
      throw new BootstrapError('No terminal to prompt on and ADMIN_PASSWORD is not set. Run this in an interactive `docker compose exec` (no -T), or see DEPLOY.md.');
    }
    if (process.env.BOOTSTRAP_CONFIRM_DB !== target.database) {
      throw new BootstrapError(`Non-interactive runs must set BOOTSTRAP_CONFIRM_DB to the target database name ("${target.database}").`);
    }
    password = process.env.ADMIN_PASSWORD;
  }

  const problems = [...validateIdentity(email, name), ...validatePassword(email, password)];
  if (problems.length) throw new BootstrapError(problems.map((p) => `- ${p}`).join('\n'));

  if (interactive) {
    console.log(`\nAbout to create the first administrator:\n  email:    ${email}\n  name:     ${name}\n  database: ${target.database} on ${target.host}`);
    const confirm = await promptVisible(`Type the database name (${target.database}) to confirm: `);
    if (confirm.trim() !== target.database) throw new BootstrapError('Confirmation did not match. Nothing was created.');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  password = ''; // drop the plaintext reference as early as possible

  const prisma = new PrismaClient();
  try {
    const created = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BOOTSTRAP_LOCK_KEY})`;
      const [users, locations, products] = await Promise.all([tx.user.count(), tx.location.count(), tx.product.count()]);
      console.log(`Database check: ${users} user(s), ${locations} location(s), ${products} product(s).`);
      if (users > 0) {
        const admins = await tx.user.count({ where: { role: Role.SUPER_ADMIN } });
        throw new BootstrapError(
          `Refusing to bootstrap: the database already has ${users} user(s) (${admins} administrator(s)). This command only runs on a database with no users, so nothing was changed. ` +
            'Further accounts are created from inside the app by an administrator.',
          3,
        );
      }
      return tx.user.create({
        data: { email: email!, name: name!, role: Role.SUPER_ADMIN, passwordHash },
        select: { id: true, email: true, role: true },
      });
    });
    console.log(`\nCreated administrator ${created.email} (${created.role}, id ${created.id}).`);
    console.log('Next: log in, then create the warehouse location, branches, users and products — see DEPLOY.md "First data".');
  } catch (err) {
    if ((err as { code?: string }).code === 'P2021') {
      throw new BootstrapError('The database tables do not exist yet. Run `npx prisma migrate deploy` first, then run this again.');
    }
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    if (err instanceof BootstrapError) {
      console.error(err.message);
      process.exit(err.exitCode);
    }
    console.error('Bootstrap failed:', (err as Error).message);
    process.exit(1);
  });
}
