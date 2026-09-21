import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

/**
 * Entrypoint for the `worker` Docker container — a NestJS application
 * context with no HTTP server, just the queue processors. Run with
 * `node dist/worker.js`.
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  // eslint-disable-next-line no-console
  console.log('Durby Warehouse worker started (queues: activity, notifications)');

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrap();
