import { BadRequestException, Injectable } from '@nestjs/common';
import type { Role } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { passwordPolicyProblems } from '../common/password-policy';
import { AuthService } from './auth.service';
import { generateResetCode, hashResetCode, normalizeResetCode } from './reset-code';

/** One message for every way a code can be wrong (unknown, malformed, used, expired, account deactivated). */
const invalidCode = () => new BadRequestException('This reset code is invalid or has expired. Ask an administrator for a new one.');

function ttlMinutes(): number {
  const n = Number(process.env.PASSWORD_RESET_TTL_MINUTES ?? 60);
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), 5), 24 * 60) : 60;
}

/**
 * Admin-initiated password reset WITHOUT the admin ever seeing a password:
 *   1. An authorized admin issues a one-time reset code for a user (issue()).
 *      That immediately disables the account's old password and ends its
 *      sessions, so a reset also works as incident response.
 *   2. The admin hands the code to the user over a private channel.
 *   3. The user opens the reset page and chooses their OWN new password with it
 *      (complete()). Codes are single-use, short-lived (default 60 minutes),
 *      stored only as a SHA-256 hash, and carry 100 bits of entropy.
 * WHO may issue a code for WHOM is decided by UsersService (the same role
 * matrix as every other user-management action); this service trusts that check.
 */
@Injectable()
export class PasswordResetService {
  constructor(
    private prisma: PrismaService,
    private activity: ActivityService,
  ) {}

  async issue(target: { id: string; email: string; name: string; role: Role }, issuerId: string, issuerName: string) {
    const code = generateResetCode();
    const tokenHash = hashResetCode(normalizeResetCode(code)!);
    const expiresAt = new Date(Date.now() + ttlMinutes() * 60_000);
    // Replace the old password with an unusable one (random, never disclosed): the account is locked until the code is used.
    const disabledHash = await AuthService.hashPassword(randomBytes(32).toString('hex'));

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.deleteMany({ where: { userId: target.id, usedAt: null } }), // a new code voids the previous one
      this.prisma.passwordResetToken.create({ data: { userId: target.id, tokenHash, expiresAt, createdById: issuerId } }),
      this.prisma.user.update({ where: { id: target.id }, data: { passwordHash: disabledHash, tokenVersion: { increment: 1 } } }),
    ]);
    // Audit trail says WHO reset WHOM and when; it never contains the code.
    await this.activity.log(`${issuerName} issued a password reset code for ${target.name}`, 'security', issuerId);
    return { code, expiresAt };
  }

  async complete(rawCode: string, newPassword: string) {
    // Email-independent policy first, so a wrong code and a weak password fail the same way whatever the code's validity.
    const early = passwordPolicyProblems(newPassword);
    if (early.length) throw new BadRequestException(early);

    const normalized = normalizeResetCode(rawCode);
    if (!normalized) throw invalidCode();
    const row = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: hashResetCode(normalized) }, include: { user: true } });
    if (!row || row.usedAt || row.expiresAt <= new Date() || !row.user.active) throw invalidCode();

    const withEmail = passwordPolicyProblems(newPassword, row.user.email);
    if (withEmail.length) throw new BadRequestException(withEmail);
    const passwordHash = await AuthService.hashPassword(newPassword);

    await this.prisma.$transaction(async (tx) => {
      // Atomic claim: of two simultaneous uses of the same code, exactly one wins.
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) throw invalidCode();
      await tx.user.update({
        where: { id: row.userId },
        data: { passwordHash, passwordChangeRequired: false, tokenVersion: { increment: 1 } },
      });
      await tx.passwordResetToken.deleteMany({ where: { userId: row.userId, usedAt: null } });
    });
    await this.activity.log(`${row.user.name} completed a password reset`, 'security', row.userId);
    return { ok: true };
  }
}
