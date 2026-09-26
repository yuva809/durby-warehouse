import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

export const ACTIVITY_QUEUE = 'activity';
export const NOTIFICATIONS_QUEUE = 'notifications';
export const PRODUCT_IMAGE_QUEUE = 'product-image';

/**
 * Registers BullMQ against the shared Redis instance.
 * - `activity`: writes to ActivityLog off the request-handling path.
 * - `notifications`: stubbed job type for future email/SMS/WhatsApp (not wired to a provider yet).
 * - `product-image`: background catalog-image enrichment for products
 *   matched/created during a supplier invoice upload — see
 *   product-images/product-image.processor.ts. Kept off the upload request
 *   path specifically so a slow/unavailable image provider can never add
 *   latency to (let alone block) stock intake.
 * All processed by the same shared worker process, not one service per
 * queue, per "avoid unnecessary microservices."
 */
@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
        password: process.env.REDIS_PASSWORD || undefined,
      },
    }),
    BullModule.registerQueue({ name: ACTIVITY_QUEUE }, { name: NOTIFICATIONS_QUEUE }, { name: PRODUCT_IMAGE_QUEUE }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
