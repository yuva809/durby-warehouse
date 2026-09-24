import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { ActivityProcessor } from './queue/activity.processor';
import { NotificationsProcessor } from './queue/notifications.processor';
import { ProductImageProcessor } from './queue/product-image.processor';
import { ProductImagesService } from './product-images/product-images.service';
import { OpenFoodFactsProvider } from './product-images/providers/open-food-facts.provider';

/**
 * The `worker` container's module graph. Deliberately small — this is not a
 * second copy of the API, it's just the BullMQ processors plus what they
 * need (DB + queue connections, and — for product-image — the same
 * ProductImagesService the API process uses, so there's exactly one
 * implementation of the enrichment logic regardless of which process runs
 * it). Kept as one worker process for every queue rather than one process
 * per queue, per "avoid unnecessary workers."
 */
@Module({
  imports: [PrismaModule, QueueModule],
  providers: [ActivityProcessor, NotificationsProcessor, ProductImageProcessor, ProductImagesService, OpenFoodFactsProvider],
})
export class WorkerModule {}
