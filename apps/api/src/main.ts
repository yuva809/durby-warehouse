import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { PrismaNotFoundFilter } from './common/filters/prisma-not-found.filter';
import { configureTrustProxy } from './common/trust-proxy';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Behind Caddy, the direct peer is always the proxy — without this every
  // client shares one rate-limit bucket. Trusts ONLY the address(es) in
  // TRUST_PROXY (docker-compose pins Caddy's IP); unset = trust nothing.
  const trustedProxies = configureTrustProxy(app, process.env.TRUST_PROXY);

  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(','),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new PrismaNotFoundFilter());

  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Durby Warehouse API listening on :${port} (trusted proxies: ${trustedProxies ? trustedProxies.join(', ') : 'none'})`);
}

bootstrap();
