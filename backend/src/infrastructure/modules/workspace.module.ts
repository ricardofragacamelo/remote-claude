import { Module } from '@nestjs/common';

import {
  ListWorkspacesUseCase,
  ResolveWorkspaceUseCase,
  WORKSPACE_ALLOWLIST_SOURCE,
  WORKSPACE_DIRECTORY_PROBE,
  WORKSPACE_USAGE_REPOSITORY,
} from '@application/workspace';
import type {
  WorkspaceAllowlistSource,
  WorkspaceDirectoryProbe,
  WorkspaceUsageRepository,
} from '@application/workspace';
import { CLOCK } from '@application/shared';
import type { Clock } from '@domain/shared';
import { WorkspaceController } from '@adapter/inbound/http/workspace/workspace.controller';
import { NodeWorkspaceDirectoryProbe } from '@adapter/outbound/filesystem/node-workspace-directory.probe';
import { DrizzleWorkspaceUsageRepository } from '@adapter/outbound/persistence/workspace/drizzle-workspace-usage.repository';
import { APP_CONFIG } from '../config/environment';
import type { AppConfig } from '../config/environment';
import { ReloadableWorkspaceAllowlist } from '../config/reloadable-workspace-allowlist';
import { AuthModule } from './auth.module';

/**
 * The `workspace` module: the first line of defence, across all four layers.
 *
 * The allowlist factory is what makes a bad allowlist fatal. It reads the file while the container
 * is being built, so a file that is missing, unreadable, empty or pointing at a root that does not
 * exist stops the process — it never becomes a backend that is up and quietly allows less, or
 * more, than the operator wrote.
 */
@Module({
  // For `BearerAuthGuard`, which resolves the caller with the very same use case the WebSocket
  // handshake uses — so a route and a socket can never disagree about who is asking.
  imports: [AuthModule],
  controllers: [WorkspaceController],
  providers: [
    {
      provide: WORKSPACE_ALLOWLIST_SOURCE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        new ReloadableWorkspaceAllowlist(config.workspaceAllowlistFile),
    },
    { provide: WORKSPACE_DIRECTORY_PROBE, useClass: NodeWorkspaceDirectoryProbe },
    { provide: WORKSPACE_USAGE_REPOSITORY, useClass: DrizzleWorkspaceUsageRepository },
    {
      provide: ListWorkspacesUseCase,
      inject: [WORKSPACE_ALLOWLIST_SOURCE, WORKSPACE_USAGE_REPOSITORY],
      useFactory: (allowlist: WorkspaceAllowlistSource, usage: WorkspaceUsageRepository) =>
        new ListWorkspacesUseCase(allowlist, usage),
    },
    {
      provide: ResolveWorkspaceUseCase,
      inject: [
        WORKSPACE_ALLOWLIST_SOURCE,
        WORKSPACE_DIRECTORY_PROBE,
        WORKSPACE_USAGE_REPOSITORY,
        CLOCK,
      ],
      useFactory: (
        allowlist: WorkspaceAllowlistSource,
        directories: WorkspaceDirectoryProbe,
        usage: WorkspaceUsageRepository,
        clock: Clock,
      ) => new ResolveWorkspaceUseCase(allowlist, directories, usage, clock),
    },
  ],
  exports: [ListWorkspacesUseCase, ResolveWorkspaceUseCase, WORKSPACE_ALLOWLIST_SOURCE],
})
export class WorkspaceModule {}
