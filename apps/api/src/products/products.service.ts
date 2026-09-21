import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import type { CreateProductDto, UpdateProductDto } from './dto/product.dto';

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private inventory: InventoryService,
  ) {}

  list(includeInactive = false) {
    return this.prisma.product.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: { name: 'asc' },
    });
  }

  get(id: string) {
    return this.prisma.product.findUniqueOrThrow({ where: { id } });
  }

  async create(dto: CreateProductDto) {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({ data: dto });
      const locations = await tx.location.findMany({ where: { active: true }, select: { id: true } });
      for (const l of locations) {
        await this.inventory.ensureRow(tx, l.id, product.id);
      }
      return product;
    });
  }

  update(id: string, dto: UpdateProductDto) {
    return this.prisma.product.update({ where: { id }, data: dto });
  }

  deactivate(id: string) {
    return this.prisma.product.update({ where: { id }, data: { active: false } });
  }

  activate(id: string) {
    return this.prisma.product.update({ where: { id }, data: { active: true } });
  }
}
