import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';

import type { DefaultsViewPayload, EngineModelsPayload } from '@remote-claude/contracts';

import {
  ClearFolderDefaultsUseCase,
  ReadDefaultsUseCase,
  ReadModelsUseCase,
  SaveDefaultsUseCase,
} from '@application/agent-settings';
import type { UserId } from '@domain/auth';
import { ZodPipe } from '@shared/validation/zod.pipe';
import { BearerAuthGuard, CurrentUser } from '../auth/bearer.guard';
import { toModelDto } from '../session/model.dto';
import {
  defaultsOf,
  engineParamSchema,
  folderDefaultsSchema,
  folderQuerySchema,
  requiredFolderQuerySchema,
  userDefaultsSchema,
} from './agent-settings.dto';
import type { FolderDefaultsBody, FolderQueryDto, UserDefaultsBody } from './agent-settings.dto';

/**
 * `/engines/:engine/*` — the defaults a session of an engine opens with, and the models of its
 * installation (plan 28, B-36, D-07): the core's settings, by engine. What only one engine has lives
 * under `/engines/<engine>/…`, in its extension.
 *
 * Every route is Bearer and scoped by who asks; an engine this installation does not drive is `404`,
 * and a folder clears the allowlist before anything else. See
 * docs/architecture/backend/03-modules.md#agent-settings.
 *
 * | Status | When |
 * |---|---|
 * | `200` / `204` | the answer |
 * | `400` | a malformed engine, folder or body — every field in `details[]` |
 * | `401` | no bearer, or an invalid one |
 * | `403` / `404` / `422` | the folder's refusals; `404` for an engine not enabled |
 * | `422` | `MODEL_NOT_AVAILABLE`, `DEFAULT_MODE_NOT_ALLOWED` |
 * | `429` / `502` / `504` | the catalogue of models had no slot, failed, or did not answer |
 * | `503` | the trail could not take the change — nothing was saved |
 */
@Controller('engines/:engine')
@UseGuards(BearerAuthGuard)
export class AgentSettingsController {
  constructor(
    @Inject(ReadModelsUseCase) private readonly models: ReadModelsUseCase,
    @Inject(ReadDefaultsUseCase) private readonly readDefaults: ReadDefaultsUseCase,
    @Inject(SaveDefaultsUseCase) private readonly saveDefaults: SaveDefaultsUseCase,
    @Inject(ClearFolderDefaultsUseCase) private readonly clearDefaults: ClearFolderDefaultsUseCase,
  ) {}

  @Get('models')
  async readModels(
    @Param('engine', new ZodPipe(engineParamSchema)) engine: string,
    @Query(new ZodPipe(folderQuerySchema)) query: FolderQueryDto,
    @CurrentUser() userId: UserId,
  ): Promise<EngineModelsPayload> {
    const view = await this.models.execute(userId, engine, query.folder ?? null);
    return { ...view, models: view.models.map(toModelDto) };
  }

  @Get('defaults')
  read(
    @Param('engine', new ZodPipe(engineParamSchema)) engine: string,
    @Query(new ZodPipe(folderQuerySchema)) query: FolderQueryDto,
    @CurrentUser() userId: UserId,
  ): Promise<DefaultsViewPayload> {
    return this.readDefaults.execute(userId, engine, query.folder ?? null);
  }

  @Put('defaults')
  saveUser(
    @Param('engine', new ZodPipe(engineParamSchema)) engine: string,
    @Body(new ZodPipe(userDefaultsSchema)) body: UserDefaultsBody,
    @CurrentUser() userId: UserId,
  ): Promise<DefaultsViewPayload> {
    return this.saveDefaults.execute(userId, engine, null, defaultsOf(body));
  }

  @Put('defaults/folder')
  saveFolder(
    @Param('engine', new ZodPipe(engineParamSchema)) engine: string,
    @Body(new ZodPipe(folderDefaultsSchema)) body: FolderDefaultsBody,
    @CurrentUser() userId: UserId,
  ): Promise<DefaultsViewPayload> {
    return this.saveDefaults.execute(userId, engine, body.folder, defaultsOf(body));
  }

  @Delete('defaults/folder')
  @HttpCode(204)
  async clearFolder(
    @Param('engine', new ZodPipe(engineParamSchema)) engine: string,
    @Query(new ZodPipe(requiredFolderQuerySchema)) query: { folder: string },
    @CurrentUser() userId: UserId,
  ): Promise<void> {
    await this.clearDefaults.execute(userId, engine, query.folder);
  }
}
