import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { NOTIFICATIONS_QUEUE } from './queue.module';

export interface NotificationJobData {
  type: 'request_submitted' | 'request_approved' | 'request_rejected' | 'delivery_out' | 'delivery_completed';
  userId?: string;
  payload: Record<string, unknown>;
}

/**
 * Stub processor — no email/SMS/WhatsApp provider is wired up yet (V1's
 * Roadmap correctly lists this as "Coming soon"). This exists so the job
 * shape and the worker plumbing are in place; wiring a real provider later
 * is a config + a `send()` call here, not an architecture change.
 */
@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  async process(job: Job<NotificationJobData>) {
    this.logger.log(`[stub] would send notification: ${job.data.type} ${JSON.stringify(job.data.payload)}`);
  }
}
