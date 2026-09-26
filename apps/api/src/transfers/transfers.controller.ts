import { Body, ConflictException, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { findWarehouse } from '../common/warehouse';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { TransfersService } from './transfers.service';
import { DocumentsService } from '../documents/documents.service';
import {
  AssignDriverDto,
  FailDeliveryDto,
  MarkDeliveredDto,
  RetryDeliveryDto,
  SetEtaDto,
  SetPickedQtyDto,
} from './dto/transfer.dto';

@Controller('transfers')
export class TransfersController {
  constructor(
    private transfers: TransfersService,
    private documents: DocumentsService,
    private prisma: PrismaService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.transfers.list(user);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.transfers.get(id, user);
  }

  /**
   * What was actually dispatched/delivered — reuses GET /transfers/:id's
   * authorization exactly (branch/driver scoped via assertAccess,
   * manager/admin unrestricted). Generated fresh from the database every
   * time; nothing about this document is ever persisted as a file.
   */
  @Get(':id/delivery-challan')
  async deliveryChallan(@Param('id') id: string, @CurrentUser() user: AuthUser, @Res() res: Response) {
    const transfer = await this.transfers.get(id, user);
    if (!transfer.dcNumber) {
      throw new ConflictException('Delivery Challan is not available until this transfer has been dispatched');
    }
    const warehouse = await findWarehouse(this.prisma, { includeInactive: true });
    this.documents.renderDeliveryChallan(res, {
      dcNumber: transfer.dcNumber,
      code: transfer.code,
      ocNumber: transfer.request?.ocNumber ?? '—',
      requestCode: transfer.request?.code ?? '—',
      branchName: transfer.branch.name,
      branchCity: transfer.branch.city,
      warehouseName: warehouse?.name ?? 'Central Warehouse',
      warehouseCity: warehouse?.city,
      dispatchDate: transfer.outForDeliveryAt,
      deliveredAt: transfer.deliveredAt,
      status: transfer.status,
      driverName: transfer.driver?.name ?? null,
      items: transfer.items.map((item) => ({
        productName: item.product.name,
        category: item.product.category,
        unit: item.product.unit,
        approvedQty: item.approvedQty,
        pickedQty: item.pickedQty ?? null,
        deliveredQty: item.deliveredQty ?? null,
        shortageReason: item.shortageReason ?? null,
      })),
    });
  }

  @Roles(Role.WAREHOUSE_MANAGER, Role.SUPER_ADMIN)
  @Post(':id/assign-driver')
  assignDriver(@Param('id') id: string, @Body() dto: AssignDriverDto, @CurrentUser() user: AuthUser) {
    return this.transfers.assignDriver(id, dto.driverId, user);
  }

  @Roles(Role.DRIVER, Role.WAREHOUSE_MANAGER, Role.SUPER_ADMIN)
  @Post(':id/start-picking')
  startPicking(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.transfers.startPicking(id, user);
  }

  @Roles(Role.DRIVER, Role.WAREHOUSE_MANAGER, Role.SUPER_ADMIN)
  @Post(':id/picked-qty')
  setPickedQty(@Param('id') id: string, @Body() dto: SetPickedQtyDto, @CurrentUser() user: AuthUser) {
    return this.transfers.setPickedQty(id, dto, user);
  }

  @Roles(Role.DRIVER, Role.WAREHOUSE_MANAGER, Role.SUPER_ADMIN)
  @Post(':id/dispatch')
  dispatch(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.transfers.dispatch(id, user);
  }

  @Roles(Role.DRIVER, Role.WAREHOUSE_MANAGER, Role.SUPER_ADMIN)
  @Post(':id/deliver')
  markDelivered(@Param('id') id: string, @Body() dto: MarkDeliveredDto, @CurrentUser() user: AuthUser) {
    return this.transfers.markDelivered(id, dto.items, user);
  }

  @Roles(Role.BRANCH_USER)
  @Post(':id/confirm-receipt')
  confirmReceipt(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.transfers.confirmReceipt(id, user);
  }

  @Roles(Role.DRIVER, Role.WAREHOUSE_MANAGER, Role.SUPER_ADMIN)
  @Post(':id/fail')
  fail(@Param('id') id: string, @Body() dto: FailDeliveryDto, @CurrentUser() user: AuthUser) {
    return this.transfers.fail(id, dto.reason, user);
  }

  @Roles(Role.WAREHOUSE_MANAGER, Role.SUPER_ADMIN)
  @Post(':id/retry')
  retry(@Param('id') id: string, @Body() dto: RetryDeliveryDto, @CurrentUser() user: AuthUser) {
    return this.transfers.retry(id, dto.driverId, user);
  }

  @Roles(Role.WAREHOUSE_MANAGER, Role.SUPER_ADMIN)
  @Post(':id/eta')
  setEta(@Param('id') id: string, @Body() dto: SetEtaDto, @CurrentUser() user: AuthUser) {
    return this.transfers.setEta(id, dto, user);
  }
}
