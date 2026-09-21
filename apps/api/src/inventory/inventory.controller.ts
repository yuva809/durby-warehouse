import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Role, MovementType } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from './inventory.service';
import { ActivityService } from '../activity/activity.service';
import { CreateAdjustmentDto, AdjustmentReason } from './dto/create-adjustment.dto';

const REASON_TO_MOVEMENT_TYPE: Record<AdjustmentReason, MovementType> = {
  [AdjustmentReason.DAMAGE]: MovementType.DAMAGE,
  [AdjustmentReason.EXPIRED]: MovementType.EXPIRED,
  [AdjustmentReason.RECOUNT]: MovementType.RECOUNT,
  [AdjustmentReason.MISSING]: MovementType.ADJUSTMENT,
  [AdjustmentReason.MANUAL_CORRECTION]: MovementType.ADJUSTMENT,
};

@Controller('inventory')
@Roles(Role.SUPER_ADMIN, Role.WAREHOUSE_MANAGER)
export class InventoryController {
  constructor(
    private prisma: PrismaService,
    private inventory: InventoryService,
    private activity: ActivityService,
  ) {}

  /** Warehouse + all branches' onHand/reserved/available, paginated. Never used for the branch role — see RequestsController for what branches see instead. */
  @Get()
  async list(@Query('locationId') locationId: string | undefined, @Query('page') page = '1', @Query('pageSize') pageSize = '50') {
    const take = Math.min(parseInt(pageSize, 10) || 50, 200);
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

    const [items, total] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where: locationId ? { locationId } : undefined,
        include: { product: true, location: true },
        orderBy: [{ location: { name: 'asc' } }, { product: { name: 'asc' } }],
        take,
        skip,
      }),
      this.prisma.inventoryItem.count({ where: locationId ? { locationId } : undefined }),
    ]);

    return {
      total,
      page: Math.max(parseInt(page, 10) || 1, 1),
      pageSize: take,
      items: items.map((i) => ({
        locationId: i.locationId,
        locationName: i.location.name,
        productId: i.productId,
        productName: i.product.name,
        sku: i.product.sku,
        unit: i.product.unit,
        onHand: i.onHand,
        reserved: i.reserved,
        available: i.onHand - i.reserved,
      })),
    };
  }

  @Get('movements')
  async movements(@Query('productId') productId?: string, @Query('locationId') locationId?: string, @Query('page') page = '1') {
    const take = 50;
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;
    const where = { ...(productId && { productId }), ...(locationId && { locationId }) };
    const [items, total] = await Promise.all([
      this.prisma.inventoryMovement.findMany({
        where,
        include: { product: true, location: true, user: true },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);
    return { total, page: Math.max(parseInt(page, 10) || 1, 1), pageSize: take, items };
  }

  @Post('adjustments')
  async createAdjustment(@Body() dto: CreateAdjustmentDto, @CurrentUser() user: AuthUser) {
    const type = REASON_TO_MOVEMENT_TYPE[dto.reason];
    const reasonText = dto.note ? `${dto.reason}: ${dto.note}` : dto.reason;

    const result = await this.prisma.$transaction(async (tx) => {
      await this.inventory.applyMovement(tx, {
        locationId: dto.locationId,
        productId: dto.productId,
        quantity: dto.quantity,
        type,
        reason: reasonText,
        userId: user.userId,
      });
      const item = await tx.inventoryItem.findUniqueOrThrow({
        where: { locationId_productId: { locationId: dto.locationId, productId: dto.productId } },
        include: { product: true, location: true },
      });
      return item;
    });

    await this.activity.log(
      `Stock adjustment (${dto.reason}) of ${dto.quantity} for ${result.product.name} at ${result.location.name}`,
      'inventory',
      user.userId,
    );

    return {
      locationId: result.locationId,
      productId: result.productId,
      onHand: result.onHand,
      reserved: result.reserved,
      available: result.onHand - result.reserved,
    };
  }
}
