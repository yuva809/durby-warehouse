import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

export const ACTIVITY_QUEUE = 'activity';
export const NOTIFICATIONS_QUEUE = 'notifications';

/**
 * Registers BullMQ against the shared Redis instance.
 * - `activity`: writes to ActivityLog off the request-handling path.
 * - `notifications`: stubbed job type for future email/SMS/WhatsApp (not wired to a provider yet).
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
    BullModule.registerQueue({ name: ACTIVITY_QUEUE }, { name: NOTIFICATIONS_QUEUE }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
