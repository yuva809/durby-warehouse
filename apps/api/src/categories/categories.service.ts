import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Open to every role, branches included — this is catalog/navigation data
   * (name, icon, product count), never a stock number, same reasoning as
   * GET /products. Product counts only include active products so an empty
   * category doesn't show up as orderable.
   */
  async list(includeInactive = false) {
    const categories = await this.prisma.productCategory.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: { where: { active: true } } } } },
    });
    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      description: c.description,
      active: c.active,
      displayOrder: c.displayOrder,
      productCount: c._count.products,
    }));
  }

  get(id: string) {
    return this.prisma.productCategory.findUniqueOrThrow({ where: { id } });
  }

  create(dto: CreateCategoryDto) {
    return this.prisma.productCategory.create({ data: dto });
  }

  update(id: string, dto: UpdateCategoryDto) {
    return this.prisma.productCategory.update({ where: { id }, data: dto });
  }

  deactivate(id: string) {
    return this.prisma.productCategory.update({ where: { id }, data: { active: false } });
  }

  activate(id: string) {
    return this.prisma.productCategory.update({ where: { id }, data: { active: true } });
  }
}
