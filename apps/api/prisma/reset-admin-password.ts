/**
 * BREAK-GLASS RECOVERY: reset the password of an existing SUPER_ADMIN from the
 * server's shell. For when the only administrator has lost their password and no
 * other SUPER_ADMIN is available to reset it from the app.
 *
 *   sudo docker compose exec -e TARGET_EMAIL=admin@company.com backend npm run reset:admin-password
 *
 * Deliberately narrow and deliberately hard to misuse:
 *   - There is NO API endpoint for this, and nothing here is reachable over the network.
 *     Only someone who already has a shell on the server (and Docker access) can run it.
 *   - It takes no arguments and no password from the environment. The new password is
 *     typed at a hidden prompt (twice) and exists nowhere else. It needs a real terminal,
 *     so it cannot be scripted, piped, or fed a password on the command line.
 *   - You must name the target with TARGET_EMAIL. The account must exist, be an ACTIVE
 *     SUPER_ADMIN (it never touches any other role, never reactivates, never creates users,
 *     never changes a role), and you must type the database name and the account's email
 *     to confirm you are pointed at the right system and the right person.
 *   - The new password must pass the app's own password policy (the same module the API uses),
 *     is hashed with the app's own bcrypt settings, and never printed.
 *   - The change is ONE transaction: the row is locked and re-checked, the password hash is
 *     replaced, tokenVersion is incremented (which ends every existing session for that
 *     account), unused reset codes are discarded, and an audit entry is written. If any part
 *     fails, none of it happens.
 *   - The audit entry records which account, when, and the operating-system user and host that ran
 *     it. It never contains a password or hash.
 *
 * Exit codes: 0 done; 1 aborted or failed (nothing changed); 2 bad usage/environment;
 * 3 target refused (missing, not a SUPER_ADMIN, deactivated, or changed while confirming);
 * 130 cancelled.
 */
import { PrismaClient, Role } from '@prisma/client';
import * as os from 'node:os';
// Shared with the API so there is one password policy and one bcrypt configuration.
// (The production image copies just these two files next to prisma/, see apps/api/Dockerfile.)
import { passwordPolicyProblems } from '../src/common/password-policy';
import { hashPassword } from '../src/common/password-hash';
import { CliError, describeTarget, promptHidden, promptVisible } from './cli-util';

const MAX_PASSWORD_ATTEMPTS = 3;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function operator(): string {
  try {
    return `${os.userInfo().username}@${os.hostname()}`;
  } catch {
    return `unknown@${os.hostname()}`;
  }
}

async function main() {
  if (process.argv.length > 2) {
    // Never echo the arguments back: one of them could be a password someone tried to pass.
    throw new CliError('This command takes no arguments. The target is set with TARGET_EMAIL, and the new password is only ever typed at the hidden prompt.', 2);
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new CliError('This command needs an interactive terminal (run it with `docker compose exec` WITHOUT -T) so the password can be typed hidden.', 2);
  }
  if (!process.env.DATABASE_URL) throw new CliError('DATABASE_URL is not set.', 2);
  const email = (process.env.TARGET_EMAIL ?? '').trim();
  if (!email) throw new CliError('Set TARGET_EMAIL to the email of the SUPER_ADMIN whose password you are resetting.', 2);
  if (!EMAIL_RE.test(email) || email !== email.toLowerCase()) throw new CliError('TARGET_EMAIL must be a valid, lowercase email address (login matches the email exactly).', 2);

  const target = describeTarget();
  const prisma = new PrismaClient();
  try {
    // ---- 1. read-only checks: refuse anything that is not exactly an active SUPER_ADMIN ----
    let account;
    try {
      account = await prisma.user.findUnique({ where: { email } });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2021') throw new CliError('The database tables do not exist. Is DATABASE_URL pointing at the right database?', 2);
      throw err;
    }
    if (!account) throw new CliError(`No account with the email ${email}. Nothing was changed.`, 3);
    if (account.role !== Role.SUPER_ADMIN) throw new CliError(`${email} is not a SUPER_ADMIN (it is a ${account.role}). This command only recovers administrator accounts, and never changes roles. Nothing was changed.`, 3);
    if (!account.active) throw new CliError(`${email} is deactivated. This command does not reactivate accounts. Nothing was changed.`, 3);

    // ---- 2. show exactly what is about to happen, and make the operator confirm it ----
    console.log('\nBREAK-GLASS PASSWORD RESET');
    console.log(`  environment: NODE_ENV=${process.env.NODE_ENV ?? '(unset)'}`);
    console.log(`  database:    ${target.database} on ${target.host}`);
    console.log(`  account:     ${account.name} <${account.email}>  role ${account.role}  created ${account.createdAt.toISOString().slice(0, 10)}`);
    console.log('  effect:      sets a new password and ends every existing session for this account.\n');
    if ((await promptVisible(`Type the database name (${target.database}) to confirm this is the right environment: `)).trim() !== target.database) {
      throw new CliError('Confirmation did not match. Nothing was changed.');
    }
    if ((await promptVisible(`Type the account's email (${email}) to confirm this is the right person: `)).trim() !== email) {
      throw new CliError('Confirmation did not match. Nothing was changed.');
    }

    // ---- 3. the new password: hidden, twice, policy-checked, a few tries ----
    let password: string | null = null;
    for (let attempt = 1; attempt <= MAX_PASSWORD_ATTEMPTS && password === null; attempt++) {
      const first = await promptHidden(`New password for ${email} (min 12 characters, not shown): `);
      const second = await promptHidden('Repeat new password: ');
      const problems = first === second ? passwordPolicyProblems(first, email) : ['The two passwords did not match.'];
      if (problems.length === 0) password = first;
      else console.log(problems.map((p) => `  - ${p}`).join('\n') + (attempt < MAX_PASSWORD_ATTEMPTS ? '\n  Try again.' : ''));
    }
    if (password === null) throw new CliError('Too many invalid attempts. Nothing was changed.');
    const passwordHash = await hashPassword(password); // outside the transaction: bcrypt is slow
    password = null; // drop the plaintext as early as possible

    // ---- 4. one atomic write: lock, re-verify, replace the hash, revoke sessions, audit ----
    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${account.id} FOR UPDATE`;
        const fresh = await tx.user.findUnique({ where: { id: account.id } });
        if (!fresh || fresh.email !== email || fresh.role !== Role.SUPER_ADMIN || !fresh.active) {
          throw new CliError('The account changed while you were confirming it (no longer an active SUPER_ADMIN). Nothing was changed.', 3);
        }
        const updated = await tx.user.update({
          where: { id: fresh.id },
          data: { passwordHash, tokenVersion: { increment: 1 }, passwordChangeRequired: false },
          select: { tokenVersion: true },
        });
        await tx.passwordResetToken.deleteMany({ where: { userId: fresh.id, usedAt: null } });
        await tx.activityLog.create({
          data: { kind: 'security', message: `Break-glass password reset for ${email} from the server console (run by ${operator()}). All of the account's sessions were ended.` },
        });
        return { before: fresh.tokenVersion, after: updated.tokenVersion };
      },
      { timeout: 20_000 },
    );
    console.log(`\nDone. The password for ${email} was replaced and all of its existing sessions ended (session version ${result.before} -> ${result.after}). An audit entry was recorded.`);
    console.log('They can sign in now with the new password. No user, role or other account was touched.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  if (err instanceof CliError) {
    console.error(`\n${err.message}`);
    process.exit(err.exitCode);
  }
  // Anything unexpected (DB down, constraint failure...): the transaction has rolled back, so nothing was changed.
  console.error(`\nFailed: ${(err as Error).message.split('\n').pop()}\nThe change is atomic, so nothing was changed.`);
  process.exit(1);
});
