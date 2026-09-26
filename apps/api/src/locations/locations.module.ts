import { Module } from '@nestjs/common';
import { LocationsService } from './locations.service';
import { LocationsController } from './locations.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [InventoryModule, UsersModule],
  providers: [LocationsService],
  controllers: [LocationsController],
  exports: [LocationsService],
})
export class LocationsModule {}
