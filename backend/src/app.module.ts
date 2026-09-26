import { Module } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { DomainExceptionFilter } from '@shared/errors/domain-exception.filter';
import { IoLoggingInterceptor } from '@shared/logging/io-logging.interceptor';
import { TraceMiddleware } from '@shared/logging/trace.middleware';
import { AuthModule } from '@infra/modules/auth.module';
import { AuditModule } from '@infra/modules/audit.module';
import { AuditQueryModule } from '@infra/modules/audit-query.module';
import { DatabaseModule } from '@infra/modules/database.module';
import { GatewayModule } from '@infra/modules/gateway.module';
import { HealthModule } from '@infra/modules/health.module';
import { NotificationModule } from '@infra/modules/notification.module';
import { PlatformModule } from '@infra/modules/platform.module';
import { DiagModule } from '@infra/modules/diag.module';
import { PermissionModule } from '@infra/modules/permission.module';
import { SessionModule } from '@infra/modules/session.module';
import { TranscriptModule } from '@infra/modules/transcript.module';
import { WorkspaceModule } from '@infra/modules/workspace.module';

/**
 * Composition root.
 *
 * The filter and the interceptor are registered here rather than on each controller: a single
 * point of mapping is what guarantees that no route can answer `200` with an error in the body,
 * and that both halves of every I/O edge are logged without anyone remembering to do it.
 */
@Module({
  imports: [
    // The internal bus for domain events. `permission.resolved` has three consumers and none of
    // them may be called directly — see docs/architecture/backend/03-modules.md.
    EventEmitterModule.forRoot(),
    PlatformModule,
    DatabaseModule,
    AuthModule,
    HealthModule,
    WorkspaceModule,
    AuditModule,
    AuditQueryModule,
    DiagModule,
    PermissionModule,
    NotificationModule,
    SessionModule,
    TranscriptModule,
    GatewayModule,
  ],
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
