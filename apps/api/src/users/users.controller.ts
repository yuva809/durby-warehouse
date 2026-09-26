import { Body, Controller, Get, Header, Param, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { CreateUserDto, InviteUserDto, ListUsersQuery, UpdateUserDto } from './dto/user.dto';

/**
 * Every route here is open to SUPER_ADMIN and WAREHOUSE_MANAGER at the door; WHAT each may do to WHOM is
 * decided per request in UsersService (see access-policy.ts). The frontend only mirrors those rules.
 */
@Controller('users')
@Roles(Role.SUPER_ADMIN, Role.WAREHOUSE_MANAGER)
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  list(@Query() query: ListUsersQuery, @CurrentUser() user: AuthUser) {
    return this.users.list(user, query);
  }

  /** Returns the one-time invitation code, shown once, never stored in plaintext. */
  @Post('invitations')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  invite(@Body() dto: InviteUserDto, @CurrentUser() user: AuthUser) {
    return this.users.invite(dto, user);
  }

  /** Legacy/scripted: an account with an admin-supplied initial password (forces a first-login change). The app uses invitations. */
  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthUser) {
    return this.users.create(dto, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() user: AuthUser) {
    return this.users.update(id, dto, user);
  }

  @Post(':id/invitation/resend')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  resendInvitation(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.users.resendInvitation(id, user);
  }

  @Post(':id/invitation/revoke')
  revokeInvitation(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.users.revokeInvitation(id, user);
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

  @Post(':id/reactivate')
  reactivate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.users.reactivate(id, user);
  }

  @Post(':id/revoke-sessions')
  revokeSessions(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.users.revokeSessions(id, user);
  }
}
