import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { effectiveImageUrl } from '../product-images/image-url.util';
import type { CreateProductDto, UpdateProductDto } from './dto/product.dto';

const IMAGE_SELECT = { select: { status: true, imageUrl: true, confidence: true } } as const;

function withImageUrl<T extends { id: string; image: { status: string; imageUrl: string | null } | null }>(p: T) {
  return { ...p, image: p.image && { ...p.image, imageUrl: effectiveImageUrl(p.id, p.image) } };
}

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private inventory: InventoryService,
  ) {}

  async list(includeInactive = false) {
    const products = await this.prisma.product.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: { name: 'asc' },
      include: { image: IMAGE_SELECT },
    });
    return products.map(withImageUrl);
  }

  /**
   * What a branch is allowed to know about warehouse stock when ordering:
   * available (onHand - reserved) per product, nothing else. Never exposes
   * onHand/reserved individually, movement history, or any other branch's
   * data — this is deliberately a much narrower shape than InventoryService
   * (manager/admin-only) returns. Optional categoryId/search narrow the
   * catalog side of the join (never the stock side) for the branch category
   * browsing UX — filtering here is just "which products", not a different
   * trust boundary.
   */
  async listWarehouseAvailability(filter?: { categoryId?: string; search?: string }) {
    const warehouse = await this.prisma.location.findFirst({ where: { type: 'WAREHOUSE' } });
    if (!warehouse) return [];

    const where: Record<string, unknown> = { active: true };
    if (filter?.categoryId) where.categoryId = filter.categoryId;
    if (filter?.search?.trim()) {
      const q = filter.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { sku: { contains: q, mode: 'insensitive' } },
        { category: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [products, inventory] = await Promise.all([
      this.prisma.product.findMany({ where, orderBy: { name: 'asc' }, include: { image: IMAGE_SELECT } }),
      this.prisma.inventoryItem.findMany({ where: { locationId: warehouse.id } }),
    ]);
    const byProduct = new Map(inventory.map((i) => [i.productId, i.onHand - i.reserved]));

    return products.map((p) => ({
      productId: p.id,
      productName: p.name,
      sku: p.sku,
      category: p.category,
      categoryId: p.categoryId,
      unit: p.unit,
      availableQuantity: Math.max(0, byProduct.get(p.id) ?? 0),
      // Only ever a live, catalog-appropriate image — a FOUND_NEEDS_REVIEW
      // candidate is never surfaced here, matching "do not silently assign
      // the image" (a branch shopper sees a placeholder, not an unverified
      // guess). ProductsController's product-detail route is open to every
      // role including branches, same trust boundary as the rest of this
      // response — an image is never a stock number.
      image: p.image && (p.image.status === 'FOUND_NEEDS_REVIEW' || p.image.status === 'NOT_FOUND') ? null : withImageUrl(p).image,
    }));
  }

  get(id: string) {
    return this.prisma.product.findUniqueOrThrow({ where: { id }, include: { image: IMAGE_SELECT } }).then(withImageUrl);
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
    return this.prisma.product.update({ where: { id }, data: dto, include: { image: IMAGE_SELECT } }).then(withImageUrl);
  }

  deactivate(id: string) {
    return this.prisma.product.update({ where: { id }, data: { active: false } });
  }

  activate(id: string) {
    return this.prisma.product.update({ where: { id }, data: { active: true } });
  }
}
