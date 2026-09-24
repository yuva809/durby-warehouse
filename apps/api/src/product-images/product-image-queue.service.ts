import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PRODUCT_IMAGE_QUEUE } from '../queue/queue.module';
import type { ProductImageJobData } from '../queue/product-image.processor';

/**
 * The producer side of background image enrichment — injected by
 * SupplierInvoicesService, never by anything that needs the result inline
 * (the manager's "Find Image" button calls ProductImagesService.lookupAndSave
 * directly instead, for an immediate response). Same fire-and-forget
 * swallow-on-failure shape as ActivityService.log(): enqueueing this must
 * never be able to fail the caller's real operation (creating/matching a
 * product during invoice upload).
 */
@Injectable()
export class ProductImageQueueService {
  private readonly logger = new Logger(ProductImageQueueService.name);

  constructor(@InjectQueue(PRODUCT_IMAGE_QUEUE) private queue: Queue<ProductImageJobData>) {}

  async enqueueLookup(productId: string) {
    try {
      await this.queue.add('lookup', { productId }, { removeOnComplete: 200, removeOnFail: 200 });
    } catch (err) {
      this.logger.warn(`Failed to enqueue image lookup for product ${productId}: ${(err as Error).message}`);
    }
  }
}
