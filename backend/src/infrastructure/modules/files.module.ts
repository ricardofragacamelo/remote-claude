import { Module } from '@nestjs/common';

import { RecordAuditEventUseCase } from '@application/audit';
import {
  DownloadArchiveUseCase,
  PreflightUploadUseCase,
  ReadLimitsUseCase,
  ReadRawUseCase,
  UploadFilesUseCase,
  VersionCache,
} from '@application/files';
import {
  ChangeOrigins,
  ClaudeWrites,
  CopyEntryUseCase,
  CreateEntryUseCase,
  DeleteEntryUseCase,
  EntryRelocator,
  FILE_HISTORY_STORE,
  FileTrail,
  FOLDER_DISK,
  FOLDER_RESOLVER,
  FOLDER_WATCHER,
  FolderWatches,
  HistoryKeeper,
  ListHistoryUseCase,
  ListTreeUseCase,
  MoveEntryUseCase,
  ReadFileUseCase,
  ReadHistoryContentUseCase,
  RestoreHistoryEntryUseCase,
  SaveFileUseCase,
  TEXT_CODEC,
  UserWrites,
} from '@application/files';
import type {
  FileHistoryStore,
  FileWriting,
  FolderDisk,
  FolderResolver,
  FolderWatcher,
  TextCodec,
} from '@application/files';
import { CLOCK, ID_GENERATOR, PATH_LOCK, SCHEDULER } from '@application/shared';
import type { PathLock, Scheduler } from '@application/shared';
import type { Clock, IdGenerator } from '@domain/shared';
import { FileHistoryController } from '@adapter/inbound/http/files/file-history.controller';
import { FileTransferController } from '@adapter/inbound/http/files/file-transfer.controller';
import { FilesController } from '@adapter/inbound/http/files/files.controller';
import { AllowlistReloadListener } from '@adapter/outbound/files/allowlist-reload.listener';
import { ClaudeWriteListener } from '@adapter/outbound/files/claude-write.listener';
import { IconvTextCodec } from '@adapter/outbound/files/iconv.text-codec';
import { WorkspaceModuleFolderResolver } from '@adapter/outbound/files/workspace-module.folder-resolver';
import { ChokidarFolderWatcher } from '@adapter/outbound/filesystem/chokidar-folder.watcher';
import { HistoryBlobDirectory } from '@adapter/outbound/filesystem/history-blob.directory';
import { NodeFolderDisk } from '@adapter/outbound/filesystem/node-folder-disk';
import { DrizzleFileHistoryStore } from '@adapter/outbound/persistence/files/drizzle-file-history.store';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { APP_CONFIG } from '../config/environment';
import type { AppConfig } from '../config/environment';
import { PERSISTENCE_CONTEXT } from '../database/persistence-context';
import type { PersistenceContext } from '../database/persistence-context';
import { FileHistoryPurgeJob } from '../jobs/file-history-purge.job';
import { AuditModule } from './audit.module';
import { AuthModule } from './auth.module';
import { WorkspaceModule } from './workspace.module';

/** What saving and creating share, as one provider so both get the very same things. */
const FILE_WRITING = Symbol('FileWriting');

/**
 * The local history (plan 07, F8): the blobs and the rows as one store, the keeper the writes ask
 * before they lose a version, the reads of the Timeline, and the purge that keeps the ceilings.
 */
const HISTORY_PROVIDERS = [
  {
    provide: HistoryBlobDirectory,
    inject: [APP_CONFIG, LOGGER],
    useFactory: (config: AppConfig, logger: Logger) =>
      new HistoryBlobDirectory(config.files.history.directory, logger),
  },
  {
    provide: DrizzleFileHistoryStore,
    inject: [PERSISTENCE_CONTEXT, HistoryBlobDirectory, APP_CONFIG],
    useFactory: (context: PersistenceContext, blobs: HistoryBlobDirectory, config: AppConfig) =>
      new DrizzleFileHistoryStore(context, blobs, config.files.history),
  },
  { provide: FILE_HISTORY_STORE, useExisting: DrizzleFileHistoryStore },
  {
    provide: HistoryKeeper,
    inject: [FILE_HISTORY_STORE, FOLDER_DISK, ID_GENERATOR, CLOCK, APP_CONFIG, LOGGER],
    useFactory: (
      store: FileHistoryStore,
      disk: FolderDisk,
      ids: IdGenerator,
      clock: Clock,
      config: AppConfig,
      logger: Logger,
    ) =>
      new HistoryKeeper(store, disk, ids, clock, config.files.history, (error, path) => {
        logger.warn(
          { op: 'files.history', layer: 'application', path, err: error },
          'a version could not be kept in the local history; the write went ahead without it',
        );
      }),
  },
  {
    provide: ListHistoryUseCase,
    inject: [FOLDER_RESOLVER, FOLDER_DISK, FILE_HISTORY_STORE],
    useFactory: (folders: FolderResolver, disk: FolderDisk, store: FileHistoryStore) =>
      new ListHistoryUseCase(folders, disk, store),
  },
  {
    provide: ReadHistoryContentUseCase,
    inject: [FOLDER_RESOLVER, FILE_HISTORY_STORE, TEXT_CODEC, APP_CONFIG],
    useFactory: (
      folders: FolderResolver,
      store: FileHistoryStore,
      codec: TextCodec,
      config: AppConfig,
    ) => new ReadHistoryContentUseCase(folders, store, codec, config.files),
  },
  {
    provide: FileHistoryPurgeJob,
    inject: [DrizzleFileHistoryStore, SCHEDULER, LOGGER],
    useFactory: (store: DrizzleFileHistoryStore, scheduler: Scheduler, logger: Logger) =>
      new FileHistoryPurgeJob(store, scheduler, logger),
  },
];

/**
 * Previews and transfer (plan 07, F7): the ceilings, the raw bytes with their remembered versions,
 * the zip of a selection, and the upload with its preflight — the writes through the same
 * `FileWriting` as the save and the create, so an upload is in the trail like any other write.
 */
const TRANSFER_PROVIDERS = [
  {
    provide: ReadLimitsUseCase,
    inject: [APP_CONFIG],
    useFactory: (config: AppConfig) =>
      new ReadLimitsUseCase(config.files, config.files.transfer, config.files.history),
  },
  {
    provide: VersionCache,
    inject: [CLOCK],
    useFactory: (clock: Clock) => new VersionCache(clock),
  },
  {
    provide: ReadRawUseCase,
    inject: [FOLDER_RESOLVER, FOLDER_DISK, FileTrail, VersionCache, APP_CONFIG],
    useFactory: (
      folders: FolderResolver,
      disk: FolderDisk,
      trail: FileTrail,
      versions: VersionCache,
      config: AppConfig,
    ) => new ReadRawUseCase(folders, disk, trail, versions, config.files.transfer),
  },
  {
    provide: DownloadArchiveUseCase,
    inject: [FOLDER_RESOLVER, FOLDER_DISK, FileTrail, APP_CONFIG],
    useFactory: (folders: FolderResolver, disk: FolderDisk, trail: FileTrail, config: AppConfig) =>
      new DownloadArchiveUseCase(folders, disk, trail, config.files.transfer),
  },
  {
    provide: PreflightUploadUseCase,
    inject: [FOLDER_RESOLVER, FOLDER_DISK, APP_CONFIG],
    useFactory: (folders: FolderResolver, disk: FolderDisk, config: AppConfig) =>
      new PreflightUploadUseCase(folders, disk, config.files.transfer),
  },
  {
    provide: UploadFilesUseCase,
    inject: [FILE_WRITING, APP_CONFIG, HistoryKeeper],
    useFactory: (writing: FileWriting, config: AppConfig, history: HistoryKeeper) =>
      new UploadFilesUseCase(writing, config.files.transfer, history),
  },
];

/**
 * The `files` module: the explorer and the editor, across all four layers
 * ([07 · D-01](../../../../docs/plans/07-explorer-and-editor/decisions.md#d-01--módulo-novo-ou-extensão-do-workspace)).
 *
 * Its arrows are the ones the catalogue draws, and only those: `workspace` by the folder resolver,
 * `audit` by writing the trail, and **nothing** of `session` — Claude's writes reach it on the
 * internal bus (docs/architecture/backend/03-modules.md#files). The lock it writes under is the
 * platform's, the same instance the undo of a session takes.
 *
 * It exports the save, and the watched folders: plan 11's replace-in-files and plan 13's `CLAUDE.md`
 * write through the first, and inherit the `ETag`, the trail and the atomicity; the gateway hands
 * `workspace.watch` to the second, and the shutdown closes its watchers (plan 07, B-21).
 */
@Module({
  imports: [AuthModule, AuditModule, WorkspaceModule],
  controllers: [FilesController, FileHistoryController, FileTransferController],
  providers: [
    { provide: FOLDER_RESOLVER, useClass: WorkspaceModuleFolderResolver },
    { provide: FOLDER_DISK, useClass: NodeFolderDisk },
    { provide: TEXT_CODEC, useClass: IconvTextCodec },
    { provide: ClaudeWrites, useFactory: () => new ClaudeWrites() },
    ClaudeWriteListener,
    {
      provide: UserWrites,
      inject: [CLOCK],
      useFactory: (clock: Clock) => new UserWrites(clock),
    },
    {
      provide: FOLDER_WATCHER,
      inject: [LOGGER],
      useFactory: (logger: Logger) => new ChokidarFolderWatcher(logger),
    },
    {
      provide: ChangeOrigins,
      inject: [ClaudeWrites, UserWrites, FOLDER_DISK, CLOCK, LOGGER],
      useFactory: (
        claude: ClaudeWrites,
        user: UserWrites,
        disk: FolderDisk,
        clock: Clock,
        logger: Logger,
      ) =>
        new ChangeOrigins(claude, user, disk, clock, (path, error) => {
          logger.debug(
            { op: 'files.watch', layer: 'application', path, err: error },
            'a changed file could not be read to tell who changed it',
          );
        }),
    },
    {
      provide: FolderWatches,
      inject: [FOLDER_RESOLVER, FOLDER_WATCHER, ChangeOrigins, SCHEDULER, ID_GENERATOR, APP_CONFIG],
      useFactory: (
        folders: FolderResolver,
        watcher: FolderWatcher,
        origins: ChangeOrigins,
        scheduler: Scheduler,
        ids: IdGenerator,
        config: AppConfig,
      ) => new FolderWatches(folders, watcher, origins, scheduler, ids, config.files.watch),
    },
    AllowlistReloadListener,
    {
      provide: FileTrail,
      inject: [RecordAuditEventUseCase, CLOCK, LOGGER],
      useFactory: (audit: RecordAuditEventUseCase, clock: Clock, logger: Logger) =>
        new FileTrail(audit, clock, (error, firstEventId) => {
          logger.error(
            { op: 'files.trail', layer: 'application', failedEventId: firstEventId, err: error },
            'the trail recorded a write the disk then refused, and could not record the refusal',
          );
        }),
    },
    {
      provide: FILE_WRITING,
      inject: [
        FOLDER_RESOLVER,
        FOLDER_DISK,
        TEXT_CODEC,
        PATH_LOCK,
        FileTrail,
        APP_CONFIG,
        UserWrites,
      ],
      useFactory: (
        folders: FolderResolver,
        disk: FolderDisk,
        codec: TextCodec,
        lock: PathLock,
        trail: FileTrail,
        config: AppConfig,
        writes: UserWrites,
      ): FileWriting => ({ folders, disk, codec, lock, trail, limits: config.files, writes }),
    },
    {
      provide: EntryRelocator,
      inject: [FILE_WRITING],
      useFactory: (writing: FileWriting) => new EntryRelocator(writing),
    },
    {
      provide: ListTreeUseCase,
      inject: [FOLDER_RESOLVER, FOLDER_DISK, APP_CONFIG],
      useFactory: (folders: FolderResolver, disk: FolderDisk, config: AppConfig) =>
        new ListTreeUseCase(folders, disk, config.files),
    },
    {
      provide: ReadFileUseCase,
      inject: [FOLDER_RESOLVER, FOLDER_DISK, TEXT_CODEC, APP_CONFIG],
      useFactory: (
        folders: FolderResolver,
        disk: FolderDisk,
        codec: TextCodec,
        config: AppConfig,
      ) => new ReadFileUseCase(folders, disk, codec, config.files),
    },
    ...HISTORY_PROVIDERS,
    ...TRANSFER_PROVIDERS,
    {
      provide: SaveFileUseCase,
      inject: [FILE_WRITING, HistoryKeeper],
      useFactory: (writing: FileWriting, history: HistoryKeeper) =>
        new SaveFileUseCase(writing, history),
    },
    {
      provide: CreateEntryUseCase,
      inject: [FILE_WRITING],
      useFactory: (writing: FileWriting) => new CreateEntryUseCase(writing),
    },
    {
      provide: MoveEntryUseCase,
      inject: [EntryRelocator, FOLDER_DISK],
      useFactory: (relocator: EntryRelocator, disk: FolderDisk) =>
        new MoveEntryUseCase(relocator, disk),
    },
    {
      provide: CopyEntryUseCase,
      inject: [EntryRelocator, FOLDER_DISK, APP_CONFIG],
      useFactory: (relocator: EntryRelocator, disk: FolderDisk, config: AppConfig) =>
        new CopyEntryUseCase(relocator, disk, config.files),
    },
    {
      provide: DeleteEntryUseCase,
      inject: [FILE_WRITING, APP_CONFIG, HistoryKeeper],
      useFactory: (writing: FileWriting, config: AppConfig, history: HistoryKeeper) =>
        new DeleteEntryUseCase(writing, config.files, history),
    },
    {
      provide: RestoreHistoryEntryUseCase,
      inject: [FILE_WRITING, FILE_HISTORY_STORE, HistoryKeeper],
      useFactory: (writing: FileWriting, store: FileHistoryStore, history: HistoryKeeper) =>
        new RestoreHistoryEntryUseCase(writing, store, history),
    },
  ],
  exports: [SaveFileUseCase, FolderWatches],
})
export class FilesModule {}
