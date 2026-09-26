import { ConflictException, Injectable } from '@nestjs/common';
import { LocationType, type Prisma } from '@prisma/client';
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

  /**
   * The business has exactly ONE warehouse and many branches. The rule is enforced on the server, in the same transaction as
   * the write and under a Postgres advisory lock, so two simultaneous "create warehouse" (or "re-activate the old one")
   * requests cannot both pass the check. No schema change is needed for this.
   */
  private async assertNoOtherActiveWarehouse(tx: Prisma.TransactionClient, exceptId?: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('durby.single-warehouse'))`;
    const other = await tx.location.findFirst({ where: { type: LocationType.WAREHOUSE, active: true, ...(exceptId && { id: { not: exceptId } }) }, select: { name: true } });
    if (other) {
      throw new ConflictException(`A warehouse already exists ("${other.name}"). The system supports exactly one active warehouse; deactivate it first if you really need to replace it.`);
    }
  }

  async create(dto: CreateLocationDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.type === LocationType.WAREHOUSE) await this.assertNoOtherActiveWarehouse(tx);
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

  /** Same rule for turning a warehouse back on, whether through activate() or `active: true` in an edit. */
  private setActive(id: string, active: boolean, extra: Prisma.LocationUpdateInput = {}) {
    return this.prisma.$transaction(async (tx) => {
      const loc = await tx.location.findUniqueOrThrow({ where: { id } });
      if (active && !loc.active && loc.type === LocationType.WAREHOUSE) await this.assertNoOtherActiveWarehouse(tx, id);
      return tx.location.update({ where: { id }, data: { ...extra, active } });
    });
  }

  update(id: string, dto: UpdateLocationDto) {
    const { active, ...rest } = dto;
    if (active === undefined) return this.prisma.location.update({ where: { id }, data: rest });
    return this.setActive(id, active, rest);
  }

  deactivate(id: string) {
    return this.prisma.location.update({ where: { id }, data: { active: false } });
  }

  activate(id: string) {
    return this.setActive(id, true);
  }
}
