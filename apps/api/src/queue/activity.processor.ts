import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ACTIVITY_QUEUE } from './queue.module';
import type { ActivityJobData } from '../activity/activity.service';

@Processor(ACTIVITY_QUEUE)
export class ActivityProcessor extends WorkerHost {
  private readonly logger = new Logger(ActivityProcessor.name);

  constructor(private prisma: PrismaService) {
    super();
  }

  async process(job: Job<ActivityJobData>) {
    const { message, kind, userId } = job.data;
    await this.prisma.activityLog.create({ data: { message, kind, userId } });
    this.logger.debug(`Logged activity: ${message}`);
  }
}
