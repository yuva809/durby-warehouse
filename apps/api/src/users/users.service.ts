import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import type { CreateUserDto, UpdateUserDto } from './dto/user.dto';

const SAFE_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  locationId: true,
  active: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  list(role?: string) {
    return this.prisma.user.findMany({
      where: role ? { role: role as never } : undefined,
      select: SAFE_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateUserDto) {
    const passwordHash = await AuthService.hashPassword(dto.password);
    return this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        role: dto.role,
        locationId: dto.locationId,
        passwordHash,
      },
      select: SAFE_SELECT,
    });
  }

  update(id: string, dto: UpdateUserDto) {
    return this.prisma.user.update({ where: { id }, data: dto, select: SAFE_SELECT });
  }

  deactivate(id: string) {
    return this.prisma.user.update({ where: { id }, data: { active: false }, select: SAFE_SELECT });
  }
}
