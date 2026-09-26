import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { ActivityProcessor } from './queue/activity.processor';
import { NotificationsProcessor } from './queue/notifications.processor';

/**
 * The `worker` container's module graph. Deliberately small — this is not a
 * second copy of the API, it's just the BullMQ processors plus what they
 * need (DB + queue connections). Kept as one worker process for every queue
 * rather than one process per queue, per "avoid unnecessary workers."
 */
@Module({
  imports: [PrismaModule, QueueModule],
  providers: [ActivityProcessor, NotificationsProcessor],
})
export class WorkerModule {}
