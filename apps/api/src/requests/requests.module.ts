import { Module } from '@nestjs/common';
import { RequestsService } from './requests.service';
import { RequestsController } from './requests.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { ActivityModule } from '../activity/activity.module';
import { CommonModule } from '../common/common.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [InventoryModule, ActivityModule, CommonModule, DocumentsModule],
  providers: [RequestsService],
  controllers: [RequestsController],
  exports: [RequestsService],
})
export class RequestsModule {}
