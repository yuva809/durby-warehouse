import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller('activity')
@Roles(Role.SUPER_ADMIN, Role.WAREHOUSE_MANAGER)
export class ActivityController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(@Query('page') page = '1') {
    const take = 50;
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;
    const [items, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.activityLog.count(),
    ]);
    return { total, page: Math.max(parseInt(page, 10) || 1, 1), pageSize: take, items };
  }
}
