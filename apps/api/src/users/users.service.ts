import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import type { CreateUserDto, UpdateUserDto } from './dto/user.dto';

export const SAFE_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  locationId: true,
  active: true,
  createdAt: true,
} as const;

// A WAREHOUSE_MANAGER's write access to the User table is deliberately
// narrower than what @Roles() lets through the door — a manager account is
// shared/operational enough that it shouldn't be able to mint or disable
// admin-level accounts. SUPER_ADMIN is unrestricted.
const MANAGER_ALLOWED_TARGET_ROLES: Role[] = [Role.BRANCH_USER, Role.DRIVER];

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

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
    const passwordHash = await AuthService.hashPassword(dto.password);
    return this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        role: dto.role,
        locationId: dto.locationId,
        passwordHash,
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
}
