import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ACTIVITY_QUEUE } from '../queue/queue.module';

export interface ActivityJobData {
  message: string;
  kind: string;
  userId?: string;
}

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(@InjectQueue(ACTIVITY_QUEUE) private queue: Queue<ActivityJobData>) {}

  /**
   * Fire-and-forget: enqueues the write and returns immediately. The worker
   * process (see queue/activity.processor.ts) writes it to ActivityLog. If
   * Redis is briefly unavailable this logs and swallows rather than failing
   * the caller's actual business operation — activity logging is narrative,
   * not a source of truth, so it must never be able to roll back a real
   * inventory transaction.
   */
  async log(message: string, kind: string, userId?: string) {
    try {
      await this.queue.add('write', { message, kind, userId }, { removeOnComplete: 500, removeOnFail: 500 });
    } catch (err) {
      this.logger.warn(`Failed to enqueue activity log: ${(err as Error).message}`);
    }
  }
}
