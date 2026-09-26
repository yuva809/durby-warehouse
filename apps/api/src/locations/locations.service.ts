import { Injectable } from '@nestjs/common';
import { LocationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import type { CreateLocationDto, UpdateLocationDto } from './dto/location.dto';

@Injectable()
export class LocationsService {
  constructor(
    private prisma: PrismaService,
    private inventory: InventoryService,
  ) {}

  list() {
    return this.prisma.location.findMany({ orderBy: { name: 'asc' } });
  }

  get(id: string) {
    return this.prisma.location.findUniqueOrThrow({ where: { id } });
  }

  async create(dto: CreateLocationDto) {
    return this.prisma.$transaction(async (tx) => {
      const location = await tx.location.create({ data: dto });
      // A new branch (or warehouse) starts with a zeroed row for every
      // active product, matching every other location — no product is ever
      // "missing" from a location's inventory, it's just 0.
      if (dto.type === LocationType.BRANCH || dto.type === LocationType.WAREHOUSE) {
        const products = await tx.product.findMany({ where: { active: true }, select: { id: true } });
        for (const p of products) {
          await this.inventory.ensureRow(tx, location.id, p.id);
        }
      }
      return location;
    });
  }

  update(id: string, dto: UpdateLocationDto) {
    return this.prisma.location.update({ where: { id }, data: dto });
  }

  deactivate(id: string) {
    return this.prisma.location.update({ where: { id }, data: { active: false } });
  }

  activate(id: string) {
    return this.prisma.location.update({ where: { id }, data: { active: true } });
  }
}
