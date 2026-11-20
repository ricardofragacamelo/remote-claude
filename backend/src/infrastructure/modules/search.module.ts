import { Module } from '@nestjs/common';

import {
  FindPathsUseCase,
  LocateCache,
  PROCESS_RUNNER,
  RIPGREP_BINARY,
  SEARCH_ENGINE,
  SEARCH_FOLDER_RESOLVER,
  SearchConcurrencyGate,
  SearchReplaceApplyUseCase,
  SearchReplacePreviewUseCase,
  SearchTextUseCase,
} from '@application/search';
import type { FolderResolver, RipgrepBinary, SearchEngine } from '@application/search';
import { ReadFileUseCase, SaveFileUseCase } from '@application/files';
import { CLOCK } from '@application/shared';
import type { Clock } from '@domain/shared';
import { NodeChildProcessRunner } from '@adapter/outbound/process/node-child-process.runner';
import { RipgrepAdapter } from '@adapter/outbound/search/ripgrep.adapter';
import { WorkspaceModuleSearchFolderResolver } from '@adapter/outbound/search/workspace-module.folder-resolver';
import { SearchController } from '@adapter/inbound/http/search/search.controller';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { APP_CONFIG } from '../config/environment';
import type { AppConfig } from '../config/environment';
import { resolveRipgrepBinary } from '../config/ripgrep-binary';
import { AuthModule } from './auth.module';
import { FilesModule } from './files.module';
import { WorkspaceModule } from './workspace.module';

/**
 * The `search` module: locating files and text inside an open folder, and replacing in batch —
 * by the `ripgrep` subprocess, under the fixed discipline of ADR-016
 * (docs/architecture/backend/03-modules.md#search).
 *
 * The ripgrep binary is resolved **while the container is built**, exactly like the workspace
 * allowlist: a binary that does not exist, does not run, or reports too old a version stops the
 * boot rather than letting the backend come up and fail the first search silently (B-07).
 */
@Module({
  imports: [AuthModule, WorkspaceModule, FilesModule],
  controllers: [SearchController],
  providers: [
    {
      provide: RIPGREP_BINARY,
      inject: [APP_CONFIG, LOGGER],
      useFactory: (config: AppConfig, logger: Logger): Promise<RipgrepBinary> =>
        resolveRipgrepBinary(config.search.ripgrepPathOverride, logger),
    },
    {
      provide: PROCESS_RUNNER,
      inject: [LOGGER],
      useFactory: (logger: Logger): NodeChildProcessRunner => new NodeChildProcessRunner(logger),
    },
    { provide: SEARCH_ENGINE, useClass: RipgrepAdapter },
    { provide: SEARCH_FOLDER_RESOLVER, useClass: WorkspaceModuleSearchFolderResolver },
    {
      provide: LocateCache,
      inject: [APP_CONFIG, CLOCK],
      useFactory: (config: AppConfig, clock: Clock): LocateCache =>
        new LocateCache(config.search.locate.cacheTtlMs, clock),
    },
    {
      provide: FindPathsUseCase,
      inject: [SEARCH_FOLDER_RESOLVER, SEARCH_ENGINE, LocateCache, APP_CONFIG],
      useFactory: (
        folders: FolderResolver,
        engine: SearchEngine,
        cache: LocateCache,
        config: AppConfig,
      ): FindPathsUseCase =>
        new FindPathsUseCase(
          folders,
          engine,
          cache,
          config.search.locate.maxFiles,
          config.search.locate.defaultResults,
          config.search.locate.maxResults,
          { timeoutMs: config.search.timeoutMs, maxBytes: config.search.processMaxBytes },
        ),
    },
    {
      provide: SearchConcurrencyGate,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): SearchConcurrencyGate =>
        new SearchConcurrencyGate(config.search.maxConcurrentPerUser),
    },
    {
      provide: SearchTextUseCase,
      inject: [SEARCH_FOLDER_RESOLVER, SEARCH_ENGINE, SearchConcurrencyGate, APP_CONFIG],
      useFactory: (
        folders: FolderResolver,
        engine: SearchEngine,
        concurrency: SearchConcurrencyGate,
        config: AppConfig,
      ): SearchTextUseCase =>
        new SearchTextUseCase(
          folders,
          engine,
          concurrency,
          config.search.maxMatches,
          config.search.previewContextChars,
          config.search.maxFileBytes,
          config.search.multilineMaxFileBytes,
          { timeoutMs: config.search.timeoutMs, maxBytes: config.search.processMaxBytes },
        ),
    },
    {
      provide: SearchReplacePreviewUseCase,
      inject: [SearchTextUseCase, ReadFileUseCase],
      useFactory: (
        searchText: SearchTextUseCase,
        readFile: ReadFileUseCase,
      ): SearchReplacePreviewUseCase => new SearchReplacePreviewUseCase(searchText, readFile),
    },
    {
      provide: SearchReplaceApplyUseCase,
      inject: [SEARCH_FOLDER_RESOLVER, SEARCH_ENGINE, ReadFileUseCase, SaveFileUseCase, APP_CONFIG],
      useFactory: (
        folders: FolderResolver,
        engine: SearchEngine,
        readFile: ReadFileUseCase,
        saveFile: SaveFileUseCase,
        config: AppConfig,
      ): SearchReplaceApplyUseCase =>
        new SearchReplaceApplyUseCase(
          folders,
          engine,
          readFile,
          saveFile,
          config.search.replaceMaxFiles,
          config.search.maxFileBytes,
          config.search.multilineMaxFileBytes,
          { timeoutMs: config.search.timeoutMs, maxBytes: config.search.processMaxBytes },
        ),
    },
  ],
  exports: [RIPGREP_BINARY, PROCESS_RUNNER, SEARCH_ENGINE, SEARCH_FOLDER_RESOLVER],
})
export class SearchModule {}
