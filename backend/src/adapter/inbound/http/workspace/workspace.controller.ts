import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

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
} from '@application/workspace';
import type { UserId } from '@domain/auth';
import { BearerAuthGuard, CurrentUser } from '../auth/bearer.guard';
import { ZodPipe } from '@shared/validation/zod.pipe';
import {
  folderSchema,
  listDirectoriesSchema,
  pinRecentFolderSchema,
  reorderOpenFoldersSchema,
  resolveWorkspaceSchema,
  toDirectoryListingDto,
  toOpenFolderEntryDto,
  toRecentFolderDto,
  toWorkspaceDto,
} from './workspace.dto';
import type {
  DirectoryListingDto,
  FolderDto,
  ListDirectoriesQueryDto,
  OpenFolderEntryDto,
  OpenFoldersDto,
  PinRecentFolderDto,
  RecentFoldersDto,
  ReorderOpenFoldersDto,
  ResolvedWorkspaceDto,
  ResolveWorkspaceDto,
  WorkspaceListDto,
} from './workspace.dto';

/**
 * The directories this installation will let Claude run in, and the folders a user opened.
 *
 * `GET /workspaces` reads the allowlist and never the disk; `resolve` touches one path. Listing is
 * the one route that reads a directory, and only in the terms of
 * docs/architecture/backend/03-modules.md#workspace: one level, on demand, directories only, inside
 * the allowlist, never past the ceiling. None of them walks a tree.
 *
 * Every path travels in the query string or the body, never as a segment of the URL: a proxy that
 * normalises `%2F` on the way through would change the value the allowlist is about to check.
 */
@Controller('workspaces')
@UseGuards(BearerAuthGuard)
export class WorkspaceController {
  constructor(
    @Inject(ListWorkspacesUseCase) private readonly list: ListWorkspacesUseCase,
    @Inject(ResolveWorkspaceUseCase) private readonly resolve: ResolveWorkspaceUseCase,
    @Inject(ListDirectoriesUseCase) private readonly directories: ListDirectoriesUseCase,
    @Inject(ListRecentFoldersUseCase) private readonly recent: ListRecentFoldersUseCase,
    @Inject(PinRecentFolderUseCase) private readonly pinRecent: PinRecentFolderUseCase,
    @Inject(ForgetRecentFolderUseCase) private readonly forgetRecent: ForgetRecentFolderUseCase,
    @Inject(ListOpenFoldersUseCase) private readonly openFolders: ListOpenFoldersUseCase,
    @Inject(OpenFolderUseCase) private readonly openFolder: OpenFolderUseCase,
    @Inject(CloseFolderUseCase) private readonly closeFolder: CloseFolderUseCase,
    @Inject(ReorderOpenFoldersUseCase) private readonly reorderFolders: ReorderOpenFoldersUseCase,
  ) {}

  /** The roots this caller may use. Only theirs: a root of somebody else is not listed at all. */
  @Get()
  async read(@CurrentUser() userId: UserId): Promise<WorkspaceListDto> {
    return { workspaces: (await this.list.execute(userId)).map(toWorkspaceDto) };
  }

  /**
   * Whether a path may be opened, and what it really is.
   *
   * Every refusal is a different status, and each one is load-bearing: `400` for a path that is
   * not a path, `403` for one outside every root or in somebody else's, `404` for one that is not
   * there, `422` for a file. See docs/architecture/shared/04-errors-and-http.md.
   */
  @Get('resolve')
  async check(
    @Query(new ZodPipe(resolveWorkspaceSchema)) query: ResolveWorkspaceDto,
    @CurrentUser() userId: UserId,
  ): Promise<ResolvedWorkspaceDto> {
    const resolved = await this.resolve.execute(query.path, userId);

    return { path: resolved.path.value, root: toWorkspaceDto(resolved.workspace) };
  }

  /**
   * The subdirectories of one folder — one level, never the tree.
   *
   * The refusals are `resolve`'s, plus `422` `WORKSPACE_DIRECTORY_UNREADABLE` for a directory this
   * process may not read.
   */
  @Get('directories')
  async listDirectories(
    @Query(new ZodPipe(listDirectoriesSchema)) query: ListDirectoriesQueryDto,
    @CurrentUser() userId: UserId,
  ): Promise<DirectoryListingDto> {
    return toDirectoryListingDto(
      await this.directories.execute(
        { path: query.path, hidden: query.hidden, prefix: query.prefix ?? null },
        userId,
      ),
    );
  }

  /** The folders this caller opened, pinned first — each marked when it can no longer be used. */
  @Get('recent')
  async readRecent(@CurrentUser() userId: UserId): Promise<RecentFoldersDto> {
    return { folders: (await this.recent.execute(userId)).map(toRecentFolderDto) };
  }

  /** Pins or unpins a recent folder. Idempotent. */
  @Put('recent/pin')
  @HttpCode(204)
  async pin(
    @Body(new ZodPipe(pinRecentFolderSchema)) body: PinRecentFolderDto,
    @CurrentUser() userId: UserId,
  ): Promise<void> {
    await this.pinRecent.execute(body.path, body.pinned, userId);
  }

  /** Takes a folder off the recent list — `204` also when it was not on it. */
  @Delete('recent')
  @HttpCode(204)
  async forget(
    @Query(new ZodPipe(folderSchema)) query: FolderDto,
    @CurrentUser() userId: UserId,
  ): Promise<void> {
    await this.forgetRecent.execute(query.path, userId);
  }

  /** The folder tabs, in order, each revalidated. */
  @Get('open-folders')
  async readOpenFolders(@CurrentUser() userId: UserId): Promise<OpenFoldersDto> {
    return { folders: (await this.openFolders.execute(userId)).map(toOpenFolderEntryDto) };
  }

  /**
   * Opens a folder in a tab: `201` with the new tab, `200` with the one already open.
   *
   * Two statuses on purpose, unlike the device registration: here the second call really is "it
   * was already there", and the client that asked for a tab has nothing to update. A refusal of
   * the path records nothing; past the ceiling it is `409` `OPEN_FOLDERS_LIMIT_REACHED`.
   */
  @Post('open-folders')
  @HttpCode(201)
  async open(
    @Body(new ZodPipe(folderSchema)) body: FolderDto,
    @CurrentUser() userId: UserId,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OpenFolderEntryDto> {
    const opened = await this.openFolder.execute(body.path, userId);

    if (!opened.created) {
      response.status(200);
    }

    return toOpenFolderEntryDto(opened.view);
  }

  /** Closes a folder's tab — `204` also when it was not open. Ends no session of Claude. */
  @Delete('open-folders')
  @HttpCode(204)
  async close(
    @Query(new ZodPipe(folderSchema)) query: FolderDto,
    @CurrentUser() userId: UserId,
  ): Promise<void> {
    await this.closeFolder.execute(query.path, userId);
  }

  /** Puts the tabs in a new order; `409` `CONFLICT` when it is not an order of the open ones. */
  @Put('open-folders/order')
  @HttpCode(204)
  async reorder(
    @Body(new ZodPipe(reorderOpenFoldersSchema)) body: ReorderOpenFoldersDto,
    @CurrentUser() userId: UserId,
  ): Promise<void> {
    await this.reorderFolders.execute(body.paths, userId);
  }
}
