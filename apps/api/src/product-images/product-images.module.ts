import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { ProductImagesService } from './product-images.service';
import { ProductImagesController } from './product-images.controller';
import { ProductImageQueueService } from './product-image-queue.service';
import { OpenFoodFactsProvider } from './providers/open-food-facts.provider';

@Module({
  imports: [QueueModule],
  providers: [ProductImagesService, ProductImageQueueService, OpenFoodFactsProvider],
  controllers: [ProductImagesController],
  exports: [ProductImagesService, ProductImageQueueService],
})
export class ProductImagesModule {}
