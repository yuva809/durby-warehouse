import { Body, Controller, Get, Header, Param, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Controller('users')
@Roles(Role.SUPER_ADMIN, Role.WAREHOUSE_MANAGER)
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  list(@Query('role') role?: string) {
    return this.users.list(role);
  }

  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthUser) {
    return this.users.create(dto, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() user: AuthUser) {
    return this.users.update(id, dto, user);
  }

  /** Returns a one-time reset code (shown once, never stored in plaintext). Server-side role rules: see UsersService.resetPassword. */
  @Post(':id/reset-password')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  resetPassword(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.users.resetPassword(id, user);
  }

  @Post(':id/deactivate')
  deactivate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.users.deactivate(id, user);
  }
}
