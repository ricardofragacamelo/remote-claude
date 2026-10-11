import { Body, Controller, Delete, Get, HttpCode, Inject, Post, Put, Query, UseGuards } from '@nestjs/common';

import {
  CheckModelUseCase,
  ReadAccountUseCase,
  ReadInstallationUseCase,
  ReadOutputStyleUseCase,
  SaveOutputStyleUseCase,
} from '@application/engines/claude';
import type {
  AccountView,
  InstallationView,
  ModelCheckOutcome,
  OutputStyleView,
} from '@application/engines/claude';
import type { UserId } from '@domain/auth';
import { ZodPipe } from '@shared/validation/zod.pipe';
import { BearerAuthGuard, CurrentUser } from '../../auth/bearer.guard';
import {
  folderQuerySchema,
  requiredFolderQuerySchema,
} from '../../agent-settings/agent-settings.dto';
import type { FolderQueryDto } from '../../agent-settings/agent-settings.dto';
import {
  accountQuerySchema,
  folderOutputStyleSchema,
  modelCheckSchema,
  userOutputStyleSchema,
} from './claude.dto';

/**
 * `/engines/claude/*` — what only Claude has (plan 28, B-36, D-07): the account its CLI is signed in
 * to, the diagnostic of its installation, the test of the connection, and the output style its
 * sessions open with. The defaults and the models every engine has are the core's, at
 * `/engines/:engine/…`; plugins, marketplaces, skills and the project's `.claude/` arrive here with
 * plan 13.
 *
 * The account, the installation and the test of the connection also answer at their `/claude/…`
 * address of plan 13, the same, for the window of the previous protocol (`v-1`, until F7).
 *
 * Every route is Bearer and scoped by who asks; a folder clears the allowlist before anything else.
 * The answers are views, never a token, a credential path nor a secret.
 *
 * | Status | When |
 * |---|---|
 * | `200` / `204` | the answer |
 * | `400` | a malformed query or body |
 * | `401` | no bearer, or an invalid one |
 * | `403` | a user with no root (account), or the folder's refusals |
 * | `429` / `502` / `504` | the installation had no slot, failed, or did not answer |
 * | `503` | the trail could not take a change — nothing was saved |
 */
@Controller()
@UseGuards(BearerAuthGuard)
export class ClaudeController {
  constructor(
    @Inject(ReadAccountUseCase) private readonly account: ReadAccountUseCase,
    @Inject(ReadInstallationUseCase) private readonly installation: ReadInstallationUseCase,
    @Inject(CheckModelUseCase) private readonly modelCheck: CheckModelUseCase,
    @Inject(ReadOutputStyleUseCase) private readonly readStyle: ReadOutputStyleUseCase,
    @Inject(SaveOutputStyleUseCase) private readonly saveStyle: SaveOutputStyleUseCase,
  ) {}

  @Get(['engines/claude/account', 'claude/account'])
  readAccount(
    @Query(new ZodPipe(accountQuerySchema)) query: { refresh?: 'true' | 'false' },
    @CurrentUser() userId: UserId,
  ): Promise<AccountView> {
    return this.account.execute(userId, query.refresh === 'true');
  }

  @Get(['engines/claude/installation', 'claude/installation'])
  readInstallation(@CurrentUser() userId: UserId): Promise<InstallationView> {
    return this.installation.execute(userId);
  }

  @Post(['engines/claude/diagnostics/model-check', 'claude/diagnostics/model-check'])
  @HttpCode(200)
  checkModel(
    @Body(new ZodPipe(modelCheckSchema)) body: { model?: string },
    @CurrentUser() userId: UserId,
  ): Promise<ModelCheckOutcome> {
    return this.modelCheck.execute(userId, body.model ?? null);
  }

  @Get('engines/claude/output-style')
  readOutputStyle(
    @Query(new ZodPipe(folderQuerySchema)) query: FolderQueryDto,
    @CurrentUser() userId: UserId,
  ): Promise<OutputStyleView> {
    return this.readStyle.execute(userId, query.folder ?? null);
  }

  @Put('engines/claude/output-style')
  saveUserOutputStyle(
    @Body(new ZodPipe(userOutputStyleSchema)) body: { outputStyle: string | null },
    @CurrentUser() userId: UserId,
  ): Promise<OutputStyleView> {
    return this.saveStyle.execute(userId, null, body.outputStyle);
  }

  @Put('engines/claude/output-style/folder')
  saveFolderOutputStyle(
    @Body(new ZodPipe(folderOutputStyleSchema)) body: { folder: string; outputStyle: string | null },
    @CurrentUser() userId: UserId,
  ): Promise<OutputStyleView> {
    return this.saveStyle.execute(userId, body.folder, body.outputStyle);
  }

  @Delete('engines/claude/output-style/folder')
  @HttpCode(204)
  async clearFolderOutputStyle(
    @Query(new ZodPipe(requiredFolderQuerySchema)) query: { folder: string },
    @CurrentUser() userId: UserId,
  ): Promise<void> {
    await this.saveStyle.execute(userId, query.folder, null);
  }
}
