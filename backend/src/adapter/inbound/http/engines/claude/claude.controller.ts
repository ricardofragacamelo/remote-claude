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
  UseGuards,
} from '@nestjs/common';

import type {
  AccountViewPayload,
  InstallationViewPayload,
  ModelCheckOutcomePayload,
  OutputStyleViewPayload,
  ProjectConfigViewPayload,
  RateLimitsViewPayload,
} from '@remote-claude/contracts';

import {
  CheckModelUseCase,
  ReadAccountUseCase,
  ReadInstallationUseCase,
  ReadOutputStyleUseCase,
  ReadProjectConfigUseCase,
  ReadRateLimitsUseCase,
  SaveOutputStyleUseCase,
} from '@application/engines/claude';
import type { InstallationView, ModelCheckOutcome } from '@application/engines/claude';
import type { RateLimitWindow } from '@domain/engines/claude';
import type { UserId } from '@domain/auth';
import { ZodPipe } from '@shared/validation/zod.pipe';
import { BearerAuthGuard, CurrentUser } from '../../auth/bearer.guard';
import {
  folderQuerySchema,
  requiredFolderQuerySchema,
  type FolderQueryDto,
} from '../../agent-settings/agent-settings.dto';
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
    @Inject(ReadProjectConfigUseCase) private readonly projectConfig: ReadProjectConfigUseCase,
    @Inject(ReadRateLimitsUseCase) private readonly rateLimits: ReadRateLimitsUseCase,
  ) {}

  @Get('engines/claude/account')
  readAccount(
    @Query(new ZodPipe(accountQuerySchema)) query: { refresh?: 'true' | 'false' },
    @CurrentUser() userId: UserId,
  ): Promise<AccountViewPayload> {
    return this.account.execute(userId, query.refresh === 'true');
  }

  @Get('engines/claude/installation')
  async readInstallation(@CurrentUser() userId: UserId): Promise<InstallationViewPayload> {
    return toInstallationViewDto(await this.installation.execute(userId));
  }

  @Post('engines/claude/diagnostics/model-check')
  @HttpCode(200)
  async checkModel(
    @Body(new ZodPipe(modelCheckSchema)) body: { model?: string },
    @CurrentUser() userId: UserId,
  ): Promise<ModelCheckOutcomePayload> {
    return toModelCheckDto(await this.modelCheck.execute(userId, body.model ?? null));
  }

  @Get('engines/claude/output-style')
  readOutputStyle(
    @Query(new ZodPipe(folderQuerySchema)) query: FolderQueryDto,
    @CurrentUser() userId: UserId,
  ): Promise<OutputStyleViewPayload> {
    return this.readStyle.execute(userId, query.folder ?? null);
  }

  @Put('engines/claude/output-style')
  saveUserOutputStyle(
    @Body(new ZodPipe(userOutputStyleSchema)) body: { outputStyle: string | null },
    @CurrentUser() userId: UserId,
  ): Promise<OutputStyleViewPayload> {
    return this.saveStyle.execute(userId, null, body.outputStyle);
  }

  @Put('engines/claude/output-style/folder')
  saveFolderOutputStyle(
    @Body(new ZodPipe(folderOutputStyleSchema))
    body: { folder: string; outputStyle: string | null },
    @CurrentUser() userId: UserId,
  ): Promise<OutputStyleViewPayload> {
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

  @Get('engines/claude/project-config')
  readProjectConfig(
    @Query(new ZodPipe(requiredFolderQuerySchema)) query: { folder: string },
    @CurrentUser() userId: UserId,
  ): Promise<ProjectConfigViewPayload> {
    return this.projectConfig.execute(userId, query.folder);
  }

  /**
   * `GET /engines/claude/usage/rate-limits` — shown to every authenticated user, with no folder:
   * the account is the machine's, shared by every session (plan 16, D-09). `userId` picks the
   * caller's own first root only to spawn the on-demand probe when nothing has pushed a reading
   * yet — the windows it answers are never scoped to that user.
   */
  @Get('engines/claude/usage/rate-limits')
  async readRateLimits(@CurrentUser() userId: UserId): Promise<RateLimitsViewPayload> {
    return { windows: (await this.rateLimits.execute(userId)).map(toRateLimitWindowDto) };
  }
}

/** A rate-limit window on the wire — `resetsAt`/`observedAt` as ISO 8601, never a `Date`. */
function toRateLimitWindowDto(window: RateLimitWindow): RateLimitsViewPayload['windows'][number] {
  return {
    kind: window.kind,
    status: window.status,
    utilizationPercent: window.utilizationPercent,
    resetsAt: window.resetsAt === null ? null : window.resetsAt.toISOString(),
    observedAt: window.observedAt.toISOString(),
    ...(window.displayName === undefined ? {} : { displayName: window.displayName }),
  };
}

/**
 * A test of the connection, on the wire: `costUsd` is a real `number` in the domain, but the
 * generator's JSON Schema subset has no float type — only `string`, `integer` and `boolean` — so
 * money travels as a decimal string, the same convention this contract already uses for
 * `turn.completed`'s `costUsd` (a float would round where nobody looked). Six places, like there.
 */
function toModelCheckDto(outcome: ModelCheckOutcome): ModelCheckOutcomePayload {
  return {
    result: outcome.result,
    model: outcome.model,
    latencyMs: outcome.latencyMs,
    costUsd: outcome.costUsd === null ? null : outcome.costUsd.toFixed(6),
    reason: outcome.reason,
    at: outcome.at.toISOString(),
  };
}

/** The installation's diagnostic, on the wire — `lastModelCheck` goes through the same money rule. */
function toInstallationViewDto(view: InstallationView): InstallationViewPayload {
  return {
    ...view,
    lastModelCheck: view.lastModelCheck === null ? null : toModelCheckDto(view.lastModelCheck),
  };
}
