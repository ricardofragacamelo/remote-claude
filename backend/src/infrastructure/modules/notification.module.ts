import { Module } from '@nestjs/common';

import {
  DeleteNotificationsUseCase,
  ListNotificationsUseCase,
  MarkNotificationsReadUseCase,
  NOTIFICATION_HISTORY_REPOSITORY,
  NotificationRegistry,
  NotifyDeviceApprovedUseCase,
  NotifyPermissionUseCase,
  PurgeNotificationsUseCase,
  PUSH_AUDIENCE,
  PUSH_SENDER,
  PUSH_TOKEN_REGISTRY,
  PushDispatcher,
  RecordNotificationUseCase,
} from '@application/notification';
import type {
  NotificationHistoryRepository,
  PushAudience,
  PushSender,
  PushTokenRegistry,
} from '@application/notification';
import { CLOCK, ID_GENERATOR, SCHEDULER } from '@application/shared';
import type { Scheduler } from '@application/shared';
import { PushMessage } from '@domain/notification';
import type { PushTarget } from '@domain/notification';
import type { Clock, IdGenerator } from '@domain/shared';
import { NotificationController } from '@adapter/inbound/http/notification/notification.controller';
import { DrizzleNotificationHistoryRepository } from '@adapter/outbound/persistence/notification/drizzle-notification-history.repository';
import {
  CancelOnPermissionResolved,
  NotifyOnPermissionRequested,
} from '@adapter/outbound/notification/permission-notification.listeners';
import { NotifyOnDeviceApproved } from '@adapter/outbound/notification/device-notification.listener';
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
import { NotificationRetentionJob } from '../jobs/notification-retention.job';
import { AuthModule } from './auth.module';
import { WebsocketModule } from './websocket.module';

/**
 * The `notification` module: how somebody who is not at the browser finds out — and the history of
 * the web's notification centre, kept on the server so it follows the user (plan 06, B-40).
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
 * The history is reached by its own routes, by the client, and by nothing else.
 */
@Module({
  imports: [AuthModule, WebsocketModule],
  controllers: [NotificationController],
  providers: [
    { provide: NOTIFICATION_HISTORY_REPOSITORY, useClass: DrizzleNotificationHistoryRepository },
    {
      provide: RecordNotificationUseCase,
      inject: [NOTIFICATION_HISTORY_REPOSITORY, CLOCK, ID_GENERATOR],
      useFactory: (history: NotificationHistoryRepository, clock: Clock, ids: IdGenerator) =>
        new RecordNotificationUseCase(history, clock, ids),
    },
    {
      provide: ListNotificationsUseCase,
      inject: [NOTIFICATION_HISTORY_REPOSITORY],
      useFactory: (history: NotificationHistoryRepository) => new ListNotificationsUseCase(history),
    },
    {
      provide: MarkNotificationsReadUseCase,
      inject: [NOTIFICATION_HISTORY_REPOSITORY, CLOCK],
      useFactory: (history: NotificationHistoryRepository, clock: Clock) =>
        new MarkNotificationsReadUseCase(history, clock),
    },
    {
      provide: DeleteNotificationsUseCase,
      inject: [NOTIFICATION_HISTORY_REPOSITORY],
      useFactory: (history: NotificationHistoryRepository) =>
        new DeleteNotificationsUseCase(history),
    },
    {
      provide: PurgeNotificationsUseCase,
      inject: [NOTIFICATION_HISTORY_REPOSITORY, CLOCK],
      useFactory: (history: NotificationHistoryRepository, clock: Clock) =>
        new PurgeNotificationsUseCase(history, clock),
    },
    {
      provide: NotificationRetentionJob,
      inject: [PurgeNotificationsUseCase, SCHEDULER, LOGGER],
      useFactory: (purge: PurgeNotificationsUseCase, scheduler: Scheduler, logger: Logger) =>
        new NotificationRetentionJob(purge, scheduler, logger),
    },
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
    {
      provide: NotifyDeviceApprovedUseCase,
      inject: [PUSH_SENDER, PUSH_TOKEN_REGISTRY],
      useFactory: (sender: PushSender, tokens: PushTokenRegistry) =>
        new NotifyDeviceApprovedUseCase(sender, tokens),
    },
    NotifyOnPermissionRequested,
    CancelOnPermissionResolved,
    NotifyOnDeviceApproved,
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
    readonly question: boolean;
  },
): PushMessage {
  const reference = {
    sessionId: command.sessionId,
    requestId: command.requestId,
    expiresAt: command.expiresAt.toISOString(),
  };

  // A question says nothing of itself, not even the tool's name (plan 24, D-22).
  return command.question
    ? PushMessage.questionAsked(target, reference)
    : PushMessage.permissionRequested(target, reference, { toolName: command.toolName });
}
