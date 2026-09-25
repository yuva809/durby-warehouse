import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { PasswordResetService } from '../auth/password-reset.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import type { CreateUserDto, UpdateUserDto } from './dto/user.dto';

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

// A WAREHOUSE_MANAGER's write access to the User table is deliberately
// narrower than what @Roles() lets through the door — a manager account is
// shared/operational enough that it shouldn't be able to mint or disable
// admin-level accounts. SUPER_ADMIN is unrestricted.
const MANAGER_ALLOWED_TARGET_ROLES: Role[] = [Role.BRANCH_USER, Role.DRIVER];

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private passwordReset: PasswordResetService,
  ) {}

  private assertCanManageRole(caller: AuthUser, targetRole: Role) {
    if (caller.role === Role.SUPER_ADMIN) return;
    if (caller.role === Role.WAREHOUSE_MANAGER && MANAGER_ALLOWED_TARGET_ROLES.includes(targetRole)) return;
    throw new ForbiddenException('Warehouse managers may only manage branch and driver accounts');
  }

  list(role?: string) {
    return this.prisma.user.findMany({
      where: role ? { role: role as never } : undefined,
      select: SAFE_USER_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateUserDto, caller: AuthUser) {
    this.assertCanManageRole(caller, dto.role);
    if (dto.requirePasswordChange === false && caller.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Only a super admin may create an account that skips the first-login password change');
    }
    const passwordHash = await AuthService.hashPassword(dto.password);
    return this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        role: dto.role,
        locationId: dto.locationId,
        passwordHash,
        // An admin-chosen (or script-generated) initial password is temporary by default.
        passwordChangeRequired: dto.requirePasswordChange ?? true,
      },
      select: SAFE_USER_SELECT,
    });
  }

  async update(id: string, dto: UpdateUserDto, caller: AuthUser) {
    const target = await this.prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!target) throw new NotFoundException('User not found');
    this.assertCanManageRole(caller, target.role);
    return this.prisma.user.update({ where: { id }, data: dto, select: SAFE_USER_SELECT });
  }

  async deactivate(id: string, caller: AuthUser) {
    const target = await this.prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!target) throw new NotFoundException('User not found');
    this.assertCanManageRole(caller, target.role);
    return this.prisma.user.update({ where: { id }, data: { active: false }, select: SAFE_USER_SELECT });
  }

  /**
   * Start an admin-initiated password reset. Authorization is enforced HERE, on
   * the server, with the same role matrix as every other user-management action:
   *  - a SUPER_ADMIN may reset anyone else (including another SUPER_ADMIN, which is
   *    the recovery path if the first admin's password is lost);
   *  - a WAREHOUSE_MANAGER may reset only BRANCH_USER and DRIVER accounts, never a
   *    manager or an admin: taking over a higher-role account would be privilege escalation;
   *  - nobody uses this on themselves (use change-password: it needs the current password);
   *  - a deactivated account can't be reset until it is reactivated.
   * The response carries the one-time code, shown once: the admin never sees a password.
   */
  async resetPassword(id: string, caller: AuthUser) {
    const target = await this.prisma.user.findUnique({ where: { id }, select: { id: true, email: true, name: true, role: true, active: true } });
    if (!target) throw new NotFoundException('User not found');
    if (target.id === caller.userId) {
      throw new BadRequestException('Use "Change password" for your own account; it needs your current password.');
    }
    this.assertCanManageRole(caller, target.role);
    if (!target.active) throw new ConflictException('This account is deactivated. Reactivate it before resetting its password.');
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: caller.userId }, select: { name: true } });
    const { code, expiresAt } = await this.passwordReset.issue(target, caller.userId, me.name);
    return { user: { id: target.id, email: target.email, name: target.name, role: target.role }, code, expiresAt };
  }
}
