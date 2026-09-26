import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { passwordPolicyProblems } from '../common/password-policy';
import { AuthService } from './auth.service';
import { generateResetCode, hashResetCode, normalizeResetCode } from './reset-code';

/** One message for every way an invitation can be unusable (unknown, malformed, used, revoked, expired, account deactivated). */
const invalidInvitation = () => new BadRequestException('This invitation link is invalid or has expired. Ask the person who invited you to send a new one.');

export function invitationTtlHours(): number {
  const n = Number(process.env.INVITATION_TTL_HOURS ?? 72);
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), 1), 24 * 14) : 72;
}

export type InvitationState = 'PENDING' | 'EXPIRED' | 'REVOKED' | 'ACCEPTED';

/** Status is derived from the timestamps, never stored, so it can't drift out of sync. */
export function invitationState(inv: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date }, now = new Date()): InvitationState {
  if (inv.acceptedAt) return 'ACCEPTED';
  if (inv.revokedAt) return 'REVOKED';
  return inv.expiresAt <= now ? 'EXPIRED' : 'PENDING';
}

/**
 * Invitations: an authorized admin adds a person WITHOUT choosing or seeing their
 * password. The account exists with an unusable random password until the invitee
 * follows the one-time link and sets their own (accept()).
 * The code has 100 bits of entropy, is single use and expires (default 72 hours),
 * and only its SHA-256 hash is stored. The plaintext code is returned once to the
 * inviter and is never logged, stored or put in an audit message.
 * WHO may invite WHOM is decided by UsersService; this service trusts that check.
 */
@Injectable()
export class InvitationsService {
  constructor(
    private prisma: PrismaService,
    private activity: ActivityService,
  ) {}

  /** Creates a fresh invitation inside the caller's transaction; returns the one-time code. */
  async createInTx(tx: Prisma.TransactionClient, userId: string, createdById: string) {
    const code = generateResetCode();
    const expiresAt = new Date(Date.now() + invitationTtlHours() * 3_600_000);
    await tx.userInvitation.create({ data: { userId, tokenHash: hashResetCode(normalizeResetCode(code)!), expiresAt, createdById } });
    return { code, expiresAt };
  }

  /** Voids every not-yet-accepted invitation for the user (used by resend, revoke and deactivate). */
  revokePendingInTx(tx: Prisma.TransactionClient, userId: string) {
    return tx.userInvitation.updateMany({ where: { userId, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  /** A random password nobody knows, so an invited account cannot be signed into until the invitee sets their own. */
  async unusablePasswordHash(): Promise<string> {
    return AuthService.hashPassword(randomBytes(32).toString('hex'));
  }

  async accept(rawCode: string, newPassword: string) {
    // Email-independent policy first, so a wrong code and a weak password fail the same way whatever the code's validity.
    const early = passwordPolicyProblems(newPassword);
    if (early.length) throw new BadRequestException(early);

    const normalized = normalizeResetCode(rawCode);
    if (!normalized) throw invalidInvitation();
    const row = await this.prisma.userInvitation.findUnique({ where: { tokenHash: hashResetCode(normalized) }, include: { user: true } });
    if (!row || invitationState(row) !== 'PENDING' || !row.user.active) throw invalidInvitation();

    const withEmail = passwordPolicyProblems(newPassword, row.user.email);
    if (withEmail.length) throw new BadRequestException(withEmail);
    const passwordHash = await AuthService.hashPassword(newPassword);

    await this.prisma.$transaction(async (tx) => {
      // Atomic claim: of two simultaneous uses of the same link, exactly one wins.
      const claimed = await tx.userInvitation.updateMany({
        where: { id: row.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count !== 1) throw invalidInvitation();
      await tx.user.update({ where: { id: row.userId }, data: { passwordHash, passwordChangeRequired: false, tokenVersion: { increment: 1 } } });
    });
    await this.activity.log(`${row.user.name} accepted their invitation and set a password`, 'security', row.userId);
    return { ok: true };
  }
}
