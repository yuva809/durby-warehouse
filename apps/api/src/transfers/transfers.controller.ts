import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { TransfersService } from './transfers.service';
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
  constructor(private transfers: TransfersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.transfers.list(user);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.transfers.get(id, user);
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
