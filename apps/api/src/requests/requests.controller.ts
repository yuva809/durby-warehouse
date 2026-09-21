import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Role, RequestStatus } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { RequestsService } from './requests.service';
import { CreateRequestDto, RejectRequestDto, UpdateApprovedQtyDto } from './dto/request.dto';

@Controller('requests')
export class RequestsController {
  constructor(private requests: RequestsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('status') status?: RequestStatus) {
    return this.requests.list(user, status);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.requests.get(id, user);
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
