import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LocationType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { AuthService } from '../auth/auth.service';
import { PasswordResetService } from '../auth/password-reset.service';
import { InvitationsService, invitationState, type InvitationState } from '../auth/invitations.service';
import { normalizeEmail } from '../common/email';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { canManageRole, invitableRoles } from './access-policy';
import type { CreateUserDto, InviteUserDto, UpdateUserDto } from './dto/user.dto';

export const SAFE_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  locationId: true,
  active: true,
  passwordChangeRequired: true,
  createdAt: true,
} as const;

export type UserStatus = 'ACTIVE' | 'DEACTIVATED' | 'INVITED' | 'INVITE_EXPIRED' | 'INVITE_REVOKED';

export interface ManagedUserView {
  id: string;
  email: string;
  name: string;
  role: Role;
  locationId: string | null;
  active: boolean;
  passwordChangeRequired: boolean;
  createdAt: Date;
  status: UserStatus;
  invitation: { state: InvitationState; sentAt: Date; expiresAt: Date; acceptedAt: Date | null; invitedBy: string | null } | null;
}

const LIST_SELECT = {
  ...SAFE_USER_SELECT,
  invitations: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { acceptedAt: true, revokedAt: true, expiresAt: true, createdAt: true, createdBy: { select: { name: true } } },
  },
} satisfies Prisma.UserSelect;

type ListRow = Prisma.UserGetPayload<{ select: typeof LIST_SELECT }>;

/** Same wording whatever exists already, so an inviter can't probe which addresses have an account (e.g. an admin's). */
const CANNOT_INVITE = 'This email address cannot be invited. If the person already has an account, find them in the list below or ask a Super Admin.';
const INVITE_INSTEAD = 'This person has not accepted their invitation yet. Send a new invitation instead.';

/** Normal user statuses, derived from `active` plus the person's latest invitation (if any). */
function toView(row: ListRow, now = new Date()): ManagedUserView {
  const { invitations, ...user } = row;
  const latest = invitations[0];
  const state = latest ? invitationState(latest, now) : null;
  let status: UserStatus;
  if (!latest || state === 'ACCEPTED') status = user.active ? 'ACTIVE' : 'DEACTIVATED';
  else if (state === 'REVOKED') status = 'INVITE_REVOKED';
  else if (state === 'EXPIRED') status = 'INVITE_EXPIRED';
  else status = 'INVITED';
  return {
    ...user,
    status,
    invitation: latest && state ? { state, sentAt: latest.createdAt, expiresAt: latest.expiresAt, acceptedAt: latest.acceptedAt, invitedBy: latest.createdBy.name } : null,
  };
}

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private passwordReset: PasswordResetService,
    private invitations: InvitationsService,
    private activity: ActivityService,
  ) {}

  // ---------------------------------------------------------------- authorization helpers

  /** 403 unless the caller's role may manage the target's role (the matrix lives in access-policy.ts). */
  private assertCanManage(caller: AuthUser, targetRole: Role) {
    if (canManageRole(caller.role, targetRole)) return;
    throw new ForbiddenException(
      caller.role === Role.WAREHOUSE_MANAGER
        ? 'Warehouse managers may only manage branch and driver accounts'
        : 'You do not have permission to manage this account',
    );
  }

  /** 403 unless the caller may hand out this role (only a SUPER_ADMIN creates a SUPER_ADMIN or WAREHOUSE_MANAGER). */
  private assertCanGrantRole(caller: AuthUser, role: Role) {
    if (invitableRoles(caller.role).includes(role)) return;
    throw new ForbiddenException(
      role === Role.SUPER_ADMIN ? 'Only a Super Admin can create another Super Admin' : 'You are not allowed to create accounts with this role',
    );
  }

  /**
   * Role/branch consistency, checked server-side on every request (a client-supplied locationId is never trusted):
   * a BRANCH_USER needs an existing, ACTIVE branch; every other role must not have a location.
   */
  private async assertValidPlacement(db: Prisma.TransactionClient | PrismaService, role: Role, locationId: string | undefined | null) {
    if (role !== Role.BRANCH_USER) {
      if (locationId) throw new BadRequestException('Only branch users are assigned to a branch');
      return;
    }
    if (!locationId) throw new BadRequestException('Choose the branch this person works at');
    const branch = await db.location.findFirst({ where: { id: locationId, type: LocationType.BRANCH, active: true }, select: { id: true } });
    if (!branch) throw new BadRequestException('Choose a valid, active branch. If none are listed, set up your branches first.');
  }

  /**
   * Runs `fn` with the target row locked and freshly loaded, so a concurrent change can't
   * slip between the permission check and the write. The caller's rights over the target are
   * checked here, before anything is changed.
   */
  private mutate<T>(
    id: string,
    caller: AuthUser,
    fn: (tx: Prisma.TransactionClient, target: FreshUser) => Promise<T>,
    opts: { lockSuperAdmins?: boolean } = {},
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        // One statement, fixed (id) order: the target and, when asked, every SUPER_ADMIN row are locked together,
        // so two admins deactivating each other at once can neither deadlock nor both pass the last-admin check.
        const locked = opts.lockSuperAdmins
          ? await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "id" = ${id} OR "role" = 'SUPER_ADMIN' ORDER BY "id" FOR UPDATE`
          : await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
        if (!locked.some((r) => r.id === id)) throw new NotFoundException('User not found');
        const target = await tx.user.findUniqueOrThrow({ where: { id }, include: { invitations: { orderBy: { createdAt: 'desc' }, take: 1 } } });
        this.assertCanManage(caller, target.role);
        return fn(tx, target);
      },
      { timeout: 15_000 },
    );
  }

  /** Active SUPER_ADMINs who can actually sign in (an unaccepted invitee cannot, so does not count). Call inside mutate({ lockSuperAdmins }). */
  private countUsableSuperAdmins(tx: Prisma.TransactionClient, excludingId: string) {
    return tx.user.count({
      where: { role: Role.SUPER_ADMIN, active: true, id: { not: excludingId }, NOT: { invitations: { some: { acceptedAt: null, revokedAt: null } } } },
    });
  }

  private neverAccepted(target: FreshUser) {
    const latest = target.invitations[0];
    return !!latest && !latest.acceptedAt;
  }

  // ---------------------------------------------------------------- reads

  /**
   * SUPER_ADMIN sees every account. A manager sees only the accounts they can manage (branch users and
   * drivers) plus themselves: they have no business seeing admin or other manager accounts.
   */
  async list(caller: AuthUser, filters: { role?: Role; locationId?: string } = {}): Promise<ManagedUserView[]> {
    const where: Prisma.UserWhereInput = {
      ...(filters.role && { role: filters.role }),
      ...(filters.locationId && { locationId: filters.locationId }),
      ...(caller.role !== Role.SUPER_ADMIN && { OR: [{ role: { in: [Role.BRANCH_USER, Role.DRIVER] } }, { id: caller.userId }] }),
    };
    const rows = await this.prisma.user.findMany({ where, select: LIST_SELECT, orderBy: { name: 'asc' } });
    const now = new Date();
    return rows.map((r) => toView(r, now));
  }

  private async view(id: string): Promise<ManagedUserView> {
    return toView(await this.prisma.user.findUniqueOrThrow({ where: { id }, select: LIST_SELECT }));
  }

  // ---------------------------------------------------------------- create / invite

  /**
   * Invite a person: creates their account with an unusable password plus a one-time invitation,
   * atomically. Returns the one-time code, shown once to the inviter (there is no email delivery yet).
   */
  async invite(dto: InviteUserDto, caller: AuthUser) {
    this.assertCanGrantRole(caller, dto.role);
    const email = normalizeEmail(dto.email);
    const passwordHash = await this.invitations.unusablePasswordHash();
    const { user, code, expiresAt } = await this.prisma.$transaction(async (tx) => {
      await this.assertValidPlacement(tx, dto.role, dto.locationId);
      let created;
      try {
        created = await tx.user.create({
          data: { email, name: dto.name.trim(), role: dto.role, locationId: dto.role === Role.BRANCH_USER ? dto.locationId : null, passwordHash, passwordChangeRequired: false },
          select: { id: true },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(CANNOT_INVITE);
        throw e;
      }
      const inv = await this.invitations.createInTx(tx, created.id, caller.userId);
      return { user: created, ...inv };
    });
    await this.activity.log(`${caller.name} invited ${dto.name.trim()} as ${dto.role}`, 'security', caller.userId);
    return { user: await this.view(user.id), invitation: { code, expiresAt } };
  }

  /** Legacy/scripted creation with an initial password. Same role, branch and duplicate rules as invitations; forces a first-login change. */
  async create(dto: CreateUserDto, caller: AuthUser) {
    this.assertCanGrantRole(caller, dto.role);
    if (dto.requirePasswordChange === false && caller.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Only a super admin may create an account that skips the first-login password change');
    }
    const email = normalizeEmail(dto.email);
    const passwordHash = await AuthService.hashPassword(dto.password);
    const created = await this.prisma.$transaction(async (tx) => {
      await this.assertValidPlacement(tx, dto.role, dto.locationId);
      try {
        return await tx.user.create({
          data: { email, name: dto.name.trim(), role: dto.role, locationId: dto.role === Role.BRANCH_USER ? dto.locationId : null, passwordHash, passwordChangeRequired: dto.requirePasswordChange ?? true },
          select: SAFE_USER_SELECT,
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(CANNOT_INVITE);
        throw e;
      }
    });
    await this.activity.log(`${caller.name} created the ${dto.role} account for ${created.name}`, 'security', caller.userId);
    return created;
  }

  // ---------------------------------------------------------------- invitations: resend / revoke

  /** New link for someone who has not accepted yet (lost, expired or revoked). The previous link stops working. */
  async resendInvitation(id: string, caller: AuthUser) {
    const result = await this.mutate(id, caller, async (tx, target) => {
      if (!this.neverAccepted(target)) throw new ConflictException('This person has already accepted their invitation. Use "Reset password" if they are locked out.');
      await this.assertValidPlacement(tx, target.role, target.locationId);
      await this.invitations.revokePendingInTx(tx, id);
      const inv = await this.invitations.createInTx(tx, id, caller.userId);
      await tx.user.update({ where: { id }, data: { active: true } }); // a revoked invitation had deactivated the account
      return { name: target.name, ...inv };
    });
    await this.activity.log(`${caller.name} sent a new invitation to ${result.name}`, 'security', caller.userId);
    return { user: await this.view(id), invitation: { code: result.code, expiresAt: result.expiresAt } };
  }

  /** Cancel an invitation that has not been accepted. The account stays (deactivated) as a record and can be re-invited. */
  async revokeInvitation(id: string, caller: AuthUser) {
    const name = await this.mutate(id, caller, async (tx, target) => {
      if (!this.neverAccepted(target)) throw new ConflictException('There is no pending invitation to revoke.');
      await this.invitations.revokePendingInTx(tx, id);
      await tx.user.update({ where: { id }, data: { active: false, tokenVersion: { increment: 1 } } });
      return target.name;
    });
    await this.activity.log(`${caller.name} revoked the invitation for ${name}`, 'security', caller.userId);
    return this.view(id);
  }

  // ---------------------------------------------------------------- edit / (de)activate / sessions

  async update(id: string, dto: UpdateUserDto, caller: AuthUser) {
    const changes = await this.mutate(id, caller, async (tx, target) => {
      const data: Prisma.UserUpdateInput = {};
      const notes: string[] = [];
      if (dto.name !== undefined && dto.name.trim() !== target.name) {
        data.name = dto.name.trim();
        notes.push(`renamed ${target.name} to ${dto.name.trim()}`);
      }
      if (dto.locationId !== undefined && dto.locationId !== target.locationId) {
        if (target.role !== Role.BRANCH_USER) throw new BadRequestException('Only branch users are assigned to a branch');
        await this.assertValidPlacement(tx, target.role, dto.locationId);
        data.location = { connect: { id: dto.locationId } };
        notes.push(`moved ${target.name} to a different branch`);
      }
      if (Object.keys(data).length) await tx.user.update({ where: { id }, data });
      return notes;
    });
    for (const n of changes) await this.activity.log(`${caller.name} ${n}`, 'security', caller.userId);
    return this.view(id);
  }

  /** Used by POST /locations/:id/assign-user/:userId, so that endpoint obeys exactly the same rules as editing the user. */
  assignBranch(caller: AuthUser, userId: string, locationId: string) {
    return this.update(userId, { locationId }, caller);
  }

  /** Removes access: ends every session, cancels any pending invitation, and never leaves the system without a working Super Admin. */
  async deactivate(id: string, caller: AuthUser) {
    if (id === caller.userId) throw new BadRequestException('You cannot deactivate your own account.');
    const name = await this.mutate(id, caller, async (tx, target) => {
      if (!target.active) return null; // already inactive: nothing to do
      if (target.role === Role.SUPER_ADMIN && !this.neverAccepted(target)) {
        if ((await this.countUsableSuperAdmins(tx, id)) === 0) throw new ConflictException('This is the last active Super Admin. Create another Super Admin first; the system must always have one.');
      }
      await this.invitations.revokePendingInTx(tx, id);
      await tx.passwordResetToken.deleteMany({ where: { userId: id, usedAt: null } });
      await tx.user.update({ where: { id }, data: { active: false, tokenVersion: { increment: 1 } } });
      return target.name;
    }, { lockSuperAdmins: true });
    if (name) await this.activity.log(`${caller.name} deactivated ${name}; all of their sessions were ended`, 'security', caller.userId);
    return this.view(id);
  }

  async reactivate(id: string, caller: AuthUser) {
    const name = await this.mutate(id, caller, async (tx, target) => {
      if (target.active) return null;
      if (this.neverAccepted(target)) throw new ConflictException(INVITE_INSTEAD);
      await this.assertValidPlacement(tx, target.role, target.locationId).catch(() => {
        throw new ConflictException('Assign this person to an active branch before reactivating them.');
      });
      await tx.user.update({ where: { id }, data: { active: true, tokenVersion: { increment: 1 } } });
      return target.name;
    });
    if (name) await this.activity.log(`${caller.name} reactivated ${name}`, 'security', caller.userId);
    return this.view(id);
  }

  /** "Sign out everywhere" for someone else, e.g. a lost phone. Password stays as it is. */
  async revokeSessions(id: string, caller: AuthUser) {
    if (id === caller.userId) throw new BadRequestException('To sign out your other devices, change your own password.');
    const name = await this.mutate(id, caller, async (tx, target) => {
      await tx.user.update({ where: { id }, data: { tokenVersion: { increment: 1 } } });
      return target.name;
    });
    await this.activity.log(`${caller.name} signed ${name} out of all devices`, 'security', caller.userId);
    return this.view(id);
  }

  // ---------------------------------------------------------------- password reset (existing flow)

  /**
   * Start an admin-initiated password reset. Authorization is enforced HERE, on
   * the server, with the same role matrix as every other user-management action:
   *  - a SUPER_ADMIN may reset anyone else (including another SUPER_ADMIN, which is
   *    the recovery path if the first admin's password is lost);
   *  - a WAREHOUSE_MANAGER may reset only BRANCH_USER and DRIVER accounts, never a
   *    manager or an admin: taking over a higher-role account would be privilege escalation;
   *  - nobody uses this on themselves (use change-password: it needs the current password);
   *  - a deactivated account can't be reset until it is reactivated;
   *  - someone who never accepted their invitation gets a new invitation instead.
   * The response carries the one-time code, shown once: the admin never sees a password.
   */
  async resetPassword(id: string, caller: AuthUser) {
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, role: true, active: true, invitations: { orderBy: { createdAt: 'desc' }, take: 1, select: { acceptedAt: true } } },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.id === caller.userId) {
      throw new BadRequestException('Use "Change password" for your own account; it needs your current password.');
    }
    this.assertCanManage(caller, target.role);
    if (!target.active) throw new ConflictException('This account is deactivated. Reactivate it before resetting its password.');
    if (target.invitations[0] && !target.invitations[0].acceptedAt) throw new ConflictException(INVITE_INSTEAD);
    const { code, expiresAt } = await this.passwordReset.issue(target, caller.userId, caller.name);
    return { user: { id: target.id, email: target.email, name: target.name, role: target.role }, code, expiresAt };
  }
}

type FreshUser = Prisma.UserGetPayload<{ include: { invitations: true } }>;
