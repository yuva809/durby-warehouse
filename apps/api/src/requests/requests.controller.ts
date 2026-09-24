import { Body, Controller, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { Role, RequestStatus } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { RequestsService } from './requests.service';
import { DocumentsService } from '../documents/documents.service';
import { CreateRequestDto, RejectRequestDto, UpdateApprovedQtyDto } from './dto/request.dto';

@Controller('requests')
export class RequestsController {
  constructor(
    private requests: RequestsService,
    private documents: DocumentsService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('status') status?: RequestStatus) {
    return this.requests.list(user, status);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.requests.get(id, user);
  }

  /**
   * Immutable record of what the branch originally requested — reuses the
   * exact same authorization as GET /requests/:id (branch scoped to their
   * own branch, driver excluded, manager/admin unrestricted), since this is
   * just that same data rendered as a document, not a separate resource.
   */
  @Get(':id/order-confirmation')
  async orderConfirmation(@Param('id') id: string, @CurrentUser() user: AuthUser, @Res() res: Response) {
    const request = await this.requests.get(id, user);
    this.documents.renderOrderConfirmation(res, {
      ocNumber: request.ocNumber,
      code: request.code,
      branchName: request.branch.name,
      branchCity: request.branch.city,
      createdAt: request.createdAt,
      status: request.status,
      createdByName: request.createdBy.name,
      items: request.items.map((item) => ({
        productName: item.product.name,
        category: item.product.category,
        unit: item.product.unit,
        requestedQty: item.requestedQty,
        approvedQty: item.approvedQty ?? null,
      })),
    });
  }

  @Roles(Role.BRANCH_USER)
  @Post()
  create(@Body() dto: CreateRequestDto, @CurrentUser() user: AuthUser) {
    return this.requests.create(user, dto);
  }

  @Roles(Role.WAREHOUSE_MANAGER, Role.SUPER_ADMIN)
  @Post(':id/review')
  markReviewing(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.requests.markReviewing(id, user);
  }

  @Roles(Role.WAREHOUSE_MANAGER, Role.SUPER_ADMIN)
  @Patch(':id/items')
  updateApprovedQty(@Param('id') id: string, @Body() dto: UpdateApprovedQtyDto, @CurrentUser() user: AuthUser) {
    return this.requests.updateApprovedQty(id, dto.productId, dto.approvedQty, user);
  }

  @Roles(Role.WAREHOUSE_MANAGER, Role.SUPER_ADMIN)
  @Post(':id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.requests.approve(id, user);
  }

  @Roles(Role.WAREHOUSE_MANAGER, Role.SUPER_ADMIN)
  @Post(':id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectRequestDto, @CurrentUser() user: AuthUser) {
    return this.requests.reject(id, dto.reason, user);
  }

  @Roles(Role.BRANCH_USER)
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.requests.cancel(id, user);
  }
}
