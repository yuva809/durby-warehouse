import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PRODUCT_IMAGE_QUEUE } from './queue.module';
import { ProductImagesService } from '../product-images/product-images.service';

export interface ProductImageJobData {
  productId: string;
}

/**
 * Runs image enrichment for a product entirely off the supplier-invoice
 * upload request path (see ProductImageQueueService.enqueue, called from
 * SupplierInvoicesService.upload). If this job fails outright — Redis
 * hiccup notwithstanding — the product simply keeps showing a placeholder
 * until a manager looks at it or a later invoice retries the lookup;
 * nothing about stock intake depends on this queue draining.
 */
@Processor(PRODUCT_IMAGE_QUEUE)
export class ProductImageProcessor extends WorkerHost {
  private readonly logger = new Logger(ProductImageProcessor.name);

  constructor(private images: ProductImagesService) {
    super();
  }

  async process(job: Job<ProductImageJobData>) {
    try {
      await this.images.lookupAndSave(job.data.productId);
    } catch (err) {
      // lookupAndSave itself never throws in normal operation (see its own
      // docblock) — this is a last-resort net so a truly unexpected error
      // (e.g. the product having been deleted between enqueue and now)
      // fails the job cleanly instead of crashing the worker process.
      this.logger.warn(`Image enrichment failed for product ${job.data.productId}: ${(err as Error).message}`);
    }
  }
}
