import { Module } from '@nestjs/common';

import {
  NotificationRegistry,
  NotifyPermissionUseCase,
  PUSH_AUDIENCE,
  PUSH_SENDER,
  PUSH_TOKEN_REGISTRY,
  PushDispatcher,
} from '@application/notification';
import type { PushAudience, PushSender, PushTokenRegistry } from '@application/notification';
import { CLOCK, SCHEDULER } from '@application/shared';
import type { Scheduler } from '@application/shared';
import { PushMessage } from '@domain/notification';
import type { PushTarget } from '@domain/notification';
import type { Clock } from '@domain/shared';
import {
  CancelOnPermissionResolved,
  NotifyOnPermissionRequested,
} from '@adapter/outbound/notification/permission-notification.listeners';
import { RegistryPushAudience } from '@adapter/outbound/notification/registry-push.audience';
import { RepositoryPushTokenRegistry } from '@adapter/outbound/notification/repository-push-token.registry';
import { HttpPushSender } from '@adapter/outbound/push/http-push.adapter';
import { PushAccessTokenCache } from '@adapter/outbound/push/push-access-token.cache';
import { PUSH_ACCESS_TOKENS, PUSH_TEXT } from '@adapter/outbound/push/push.tokens';
import { loggingRetryReporter } from '@adapter/outbound/push/push-retry.reporter';
import { PushTranslator } from '@shared/i18n/push-translator';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { APP_CONFIG } from '../config/environment';
import type { AppConfig } from '../config/environment';
import { AuthModule } from './auth.module';
import { WebsocketModule } from './websocket.module';

/**
 * The `notification` module: how somebody who is not at the browser finds out.
 *
 * It decides **how** to notify; **whether** anything deserves notifying is `permission`'s, and it
 * says so on the internal bus rather than by calling anybody
 * (docs/architecture/backend/03-modules.md#notification).
 *
 * The registry is a singleton with the process, like the permission registry and for the same
 * reason: what it holds is about questions that are open right now, and none of that survives a
 * restart.
 *
 * Nothing here exports anything. Every other module reaches this one through the bus, and a
 * module that exported its use case would be inviting the direct call the bus exists to prevent.
 */
@Module({
  imports: [AuthModule, WebsocketModule],
  providers: [
    { provide: PUSH_AUDIENCE, useClass: RegistryPushAudience },
    { provide: PUSH_TOKEN_REGISTRY, useClass: RepositoryPushTokenRegistry },
    { provide: PUSH_TEXT, useFactory: () => new PushTranslator() },
    {
      provide: PUSH_ACCESS_TOKENS,
      inject: [APP_CONFIG, CLOCK],
      useFactory: (config: AppConfig, clock: Clock) =>
        new PushAccessTokenCache(config.push.scope, clock),
    },
    { provide: PUSH_SENDER, useClass: HttpPushSender },
    { provide: NotificationRegistry, useFactory: () => new NotificationRegistry() },
    {
      // One per process, like the registry: `stop` has to find the retries of a request whoever
      // armed them.
      provide: PushDispatcher,
      inject: [PUSH_SENDER, SCHEDULER, CLOCK, LOGGER],
      useFactory: (sender: PushSender, scheduler: Scheduler, clock: Clock, logger: Logger) =>
        new PushDispatcher(sender, scheduler, clock, loggingRetryReporter(logger)),
    },
    {
      provide: NotifyPermissionUseCase,
      inject: [PUSH_AUDIENCE, PushDispatcher, PUSH_TOKEN_REGISTRY, NotificationRegistry],
      useFactory: (
        audience: PushAudience,
        dispatcher: PushDispatcher,
        tokens: PushTokenRegistry,
        registry: NotificationRegistry,
      ) =>
        new NotifyPermissionUseCase(audience, dispatcher, tokens, registry, (target, command) =>
          // Composed here, where both halves are in scope: the domain owns what a message may
          // carry, and the adapter owns the words. The use case owns neither, which is what
          // keeps the tool's **input** out of the payload by construction.
          permissionMessage(target, command),
        ),
    },
    NotifyOnPermissionRequested,
    CancelOnPermissionResolved,
  ],
})
export class NotificationModule {}

/** One question, as a message for one device. The tool's name interpolates; nothing else does. */
function permissionMessage(
  target: PushTarget,
  command: {
    readonly sessionId: string;
    readonly requestId: string;
    readonly expiresAt: Date;
    readonly toolName: string;
  },
): PushMessage {
  return PushMessage.permissionRequested(
    target,
    {
      sessionId: command.sessionId,
      requestId: command.requestId,
      expiresAt: command.expiresAt.toISOString(),
    },
    { toolName: command.toolName },
  );
}
