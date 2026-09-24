import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { CommonModule } from './common/common.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { LocationsModule } from './locations/locations.module';
import { ProductsModule } from './products/products.module';
import { ProductImagesModule } from './product-images/product-images.module';
import { CategoriesModule } from './categories/categories.module';
import { InventoryModule } from './inventory/inventory.module';
import { RequestsModule } from './requests/requests.module';
import { TransfersModule } from './transfers/transfers.module';
import { SupplierInvoicesModule } from './supplier-invoices/supplier-invoices.module';
import { ActivityModule } from './activity/activity.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
    }),
    PrismaModule,
    RedisModule,
    CommonModule,
    AuthModule,
    UsersModule,
    LocationsModule,
    ProductsModule,
    ProductImagesModule,
    CategoriesModule,
    InventoryModule,
    RequestsModule,
    TransfersModule,
    SupplierInvoicesModule,
    ActivityModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    // Order matters: JwtAuthGuard populates request.user, RolesGuard reads it.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
