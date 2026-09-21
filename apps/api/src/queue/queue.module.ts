import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

export const ACTIVITY_QUEUE = 'activity';
export const NOTIFICATIONS_QUEUE = 'notifications';

/**
 * Registers BullMQ against the shared Redis instance. Two small queues:
 * - `activity`: writes to ActivityLog off the request-handling path.
 * - `notifications`: stubbed job type for future email/SMS/WhatsApp (V1's
 *   Roadmap page already promises this) — processed by the same worker
 *   process, not a separate service, per "avoid unnecessary microservices."
 */
@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    }),
    BullModule.registerQueue({ name: ACTIVITY_QUEUE }, { name: NOTIFICATIONS_QUEUE }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
