import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { UsersService } from '../users/users.service';
import { LocationsService } from './locations.service';
import { CreateLocationDto, UpdateLocationDto } from './dto/location.dto';

@Controller('locations')
export class LocationsController {
  constructor(
    private locations: LocationsService,
    private users: UsersService,
  ) {}

  /** Any authenticated role may read the branch list — it's just names, not inventory. */
  @Get()
  list() {
    return this.locations.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.locations.get(id);
  }

  @Roles(Role.SUPER_ADMIN, Role.WAREHOUSE_MANAGER)
  @Post()
  create(@Body() dto: CreateLocationDto) {
    return this.locations.create(dto);
  }

  @Roles(Role.SUPER_ADMIN, Role.WAREHOUSE_MANAGER)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateLocationDto) {
    return this.locations.update(id, dto);
  }

  @Roles(Role.SUPER_ADMIN, Role.WAREHOUSE_MANAGER)
  @Post(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.locations.deactivate(id);
  }

  @Roles(Role.SUPER_ADMIN, Role.WAREHOUSE_MANAGER)
  @Post(':id/activate')
  activate(@Param('id') id: string) {
    return this.locations.activate(id);
  }

  @Roles(Role.SUPER_ADMIN, Role.WAREHOUSE_MANAGER)
  /** Delegates to UsersService so it obeys the same rules as editing the user: a manager cannot move admins or managers, and only branch users take a branch. */
  @Post(':id/assign-user/:userId')
  assignUser(@Param('id') id: string, @Param('userId') userId: string, @CurrentUser() caller: AuthUser) {
    return this.users.assignBranch(caller, userId, id);
  }
}
