import { Module } from '@nestjs/common';

import {
  CloseFolderUseCase,
  ForgetRecentFolderUseCase,
  ListDirectoriesUseCase,
  ListOpenFoldersUseCase,
  ListRecentFoldersUseCase,
  ListWorkspacesUseCase,
  OpenFolderUseCase,
  PinRecentFolderUseCase,
  ReorderOpenFoldersUseCase,
  ResolveWorkspaceUseCase,
  RevalidatedFolders,
  WORKSPACE_ALLOWLIST_SOURCE,
  WORKSPACE_DIRECTORY_LISTER,
  WORKSPACE_DIRECTORY_PROBE,
  WORKSPACE_FOLDER_REPOSITORY,
  WORKSPACE_USAGE_REPOSITORY,
} from '@application/workspace';
import type {
  WorkspaceAllowlistSource,
  WorkspaceDirectoryLister,
  WorkspaceDirectoryProbe,
  WorkspaceFolderRepository,
  WorkspaceUsageRepository,
} from '@application/workspace';
import { CLOCK } from '@application/shared';
import type { Clock } from '@domain/shared';
import { WorkspaceController } from '@adapter/inbound/http/workspace/workspace.controller';
import { NodeWorkspaceDirectoryLister } from '@adapter/outbound/filesystem/node-workspace-directory.lister';
import { NodeWorkspaceDirectoryProbe } from '@adapter/outbound/filesystem/node-workspace-directory.probe';
import { DrizzleWorkspaceFolderRepository } from '@adapter/outbound/persistence/workspace/drizzle-workspace-folder.repository';
import { DrizzleWorkspaceUsageRepository } from '@adapter/outbound/persistence/workspace/drizzle-workspace-usage.repository';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { APP_CONFIG } from '../config/environment';
import type { AppConfig } from '../config/environment';
import { AllowlistReloadSignal } from '../config/allowlist-reload.signal';
import { ReloadableWorkspaceAllowlist } from '../config/reloadable-workspace-allowlist';
import { AuthModule } from './auth.module';

/** The allowlist behind its port, and the same object as the thing that can reload it. */
const RELOADABLE_ALLOWLIST = Symbol('ReloadableWorkspaceAllowlist');

/**
 * The `workspace` module: the first line of defence, across all four layers.
 *
 * The allowlist factory is what makes a bad allowlist fatal. It reads the file while the container
 * is being built, so a file that is missing, unreadable, empty or pointing at a root that does not
 * exist stops the process — it never becomes a backend that is up and quietly allows less, or
 * more, than the operator wrote. The reload is `SIGHUP`, and nothing else (06 · D-15).
 */
@Module({
  // For `BearerAuthGuard`, which resolves the caller with the very same use case the WebSocket
  // handshake uses — so a route and a socket can never disagree about who is asking.
  imports: [AuthModule],
  controllers: [WorkspaceController],
  providers: [
    {
      provide: RELOADABLE_ALLOWLIST,
      inject: [APP_CONFIG, LOGGER],
      useFactory: (config: AppConfig, logger: Logger) =>
        ReloadableWorkspaceAllowlist.load(config.workspaceAllowlistFile, logger),
    },
    { provide: WORKSPACE_ALLOWLIST_SOURCE, useExisting: RELOADABLE_ALLOWLIST },
    {
      provide: AllowlistReloadSignal,
      inject: [RELOADABLE_ALLOWLIST, LOGGER],
      useFactory: (allowlist: ReloadableWorkspaceAllowlist, logger: Logger) =>
        new AllowlistReloadSignal(allowlist, logger),
    },
    { provide: WORKSPACE_DIRECTORY_PROBE, useClass: NodeWorkspaceDirectoryProbe },
    { provide: WORKSPACE_DIRECTORY_LISTER, useClass: NodeWorkspaceDirectoryLister },
    { provide: WORKSPACE_USAGE_REPOSITORY, useClass: DrizzleWorkspaceUsageRepository },
    { provide: WORKSPACE_FOLDER_REPOSITORY, useClass: DrizzleWorkspaceFolderRepository },
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
    {
      provide: ListDirectoriesUseCase,
      inject: [WORKSPACE_ALLOWLIST_SOURCE, WORKSPACE_DIRECTORY_PROBE, WORKSPACE_DIRECTORY_LISTER],
      useFactory: (
        allowlist: WorkspaceAllowlistSource,
        directories: WorkspaceDirectoryProbe,
        lister: WorkspaceDirectoryLister,
      ) => new ListDirectoriesUseCase(allowlist, directories, lister),
    },
    {
      provide: OpenFolderUseCase,
      inject: [
        WORKSPACE_ALLOWLIST_SOURCE,
        WORKSPACE_DIRECTORY_PROBE,
        WORKSPACE_FOLDER_REPOSITORY,
        CLOCK,
      ],
      useFactory: (
        allowlist: WorkspaceAllowlistSource,
        directories: WorkspaceDirectoryProbe,
        folders: WorkspaceFolderRepository,
        clock: Clock,
      ) => new OpenFolderUseCase(allowlist, directories, folders, clock),
    },
    {
      provide: RevalidatedFolders,
      inject: [WORKSPACE_ALLOWLIST_SOURCE, WORKSPACE_DIRECTORY_PROBE, WORKSPACE_FOLDER_REPOSITORY],
      useFactory: (
        allowlist: WorkspaceAllowlistSource,
        directories: WorkspaceDirectoryProbe,
        folders: WorkspaceFolderRepository,
      ) => new RevalidatedFolders(allowlist, directories, folders),
    },
    {
      provide: ListOpenFoldersUseCase,
      inject: [RevalidatedFolders],
      useFactory: (folders: RevalidatedFolders) => new ListOpenFoldersUseCase(folders),
    },
    {
      provide: ListRecentFoldersUseCase,
      inject: [RevalidatedFolders],
      useFactory: (folders: RevalidatedFolders) => new ListRecentFoldersUseCase(folders),
    },
    {
      provide: CloseFolderUseCase,
      inject: [WORKSPACE_FOLDER_REPOSITORY],
      useFactory: (folders: WorkspaceFolderRepository) => new CloseFolderUseCase(folders),
    },
    {
      provide: ReorderOpenFoldersUseCase,
      inject: [WORKSPACE_FOLDER_REPOSITORY],
      useFactory: (folders: WorkspaceFolderRepository) => new ReorderOpenFoldersUseCase(folders),
    },
    {
      provide: PinRecentFolderUseCase,
      inject: [WORKSPACE_FOLDER_REPOSITORY],
      useFactory: (folders: WorkspaceFolderRepository) => new PinRecentFolderUseCase(folders),
    },
    {
      provide: ForgetRecentFolderUseCase,
      inject: [WORKSPACE_FOLDER_REPOSITORY],
      useFactory: (folders: WorkspaceFolderRepository) => new ForgetRecentFolderUseCase(folders),
    },
  ],
  exports: [ListWorkspacesUseCase, ResolveWorkspaceUseCase, WORKSPACE_ALLOWLIST_SOURCE],
})
export class WorkspaceModule {}
