import { Module } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import { DomainExceptionFilter } from '@shared/errors/domain-exception.filter';
import { IoLoggingInterceptor } from '@shared/logging/io-logging.interceptor';
import { TraceMiddleware } from '@shared/logging/trace.middleware';
import { AuthModule } from '@infra/modules/auth.module';
import { DatabaseModule } from '@infra/modules/database.module';
import { GatewayModule } from '@infra/modules/gateway.module';
import { HealthModule } from '@infra/modules/health.module';
import { PlatformModule } from '@infra/modules/platform.module';
import { SessionModule } from '@infra/modules/session.module';

/**
 * Composition root.
 *
 * The filter and the interceptor are registered here rather than on each controller: a single
 * point of mapping is what guarantees that no route can answer `200` with an error in the body,
 * and that both halves of every I/O edge are logged without anyone remembering to do it.
 */
@Module({
  imports: [PlatformModule, DatabaseModule, AuthModule, HealthModule, SessionModule, GatewayModule],
  providers: [
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: IoLoggingInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TraceMiddleware).forRoutes('*splat');
  }
}
