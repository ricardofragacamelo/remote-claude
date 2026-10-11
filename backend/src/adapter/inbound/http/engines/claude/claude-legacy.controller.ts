import { Body, Controller, Delete, Get, HttpCode, Inject, Put, Query, UseGuards } from '@nestjs/common';

import { ReadModelsUseCase } from '@application/agent-settings';
import type { ModelsView } from '@application/agent-settings';
import { LegacyDefaultsUseCases } from '@application/engines/claude';
import type { LegacyDefaultsView } from '@application/engines/claude';
import type { UserId } from '@domain/auth';
import { ZodPipe } from '@shared/validation/zod.pipe';
import { BearerAuthGuard, CurrentUser } from '../../auth/bearer.guard';
import {
  folderQuerySchema,
  requiredFolderQuerySchema,
} from '../../agent-settings/agent-settings.dto';
import type { FolderQueryDto } from '../../agent-settings/agent-settings.dto';
import { toModelDto } from '../../session/model.dto';
import type { ModelDto } from '../../session/model.dto';
import { legacyDefaultsOf, legacyFolderDefaultsSchema, legacyUserDefaultsSchema } from './claude.dto';
import type { LegacyFolderDefaultsBody, LegacyUserDefaultsBody } from './claude.dto';

/** The DI token of the name of the engine the routes of the first protocol are answered for. */
export const LEGACY_ENGINE = Symbol('LegacyEngine');

/** `GET /claude/models` as the first protocol answered it: the version under its old name. */
export interface LegacyModelsDto extends Omit<ModelsView, 'version' | 'models'> {
  readonly cliVersion: string | null;
  readonly models: readonly ModelDto[];
}

/**
 * `/claude/models` and `/claude/defaults…` — the routes of plan 13, F1, that the split moved to the
 * core, kept answering the same for the window of the previous protocol (plan 28, D-07: `v-1`) while
 * the clients move to `/engines/:engine/…`. The models come from the core's use case for Claude, and
 * the defaults from the core's put back together with the output style of the extension.
 *
 * Removed at the end of the window (plan 28, F7).
 */
@Controller('claude')
@UseGuards(BearerAuthGuard)
export class ClaudeLegacyController {
  constructor(
    @Inject(ReadModelsUseCase) private readonly models: ReadModelsUseCase,
    @Inject(LegacyDefaultsUseCases) private readonly defaults: LegacyDefaultsUseCases,
    @Inject(LEGACY_ENGINE) private readonly engine: string,
  ) {}

  @Get('models')
  async readModels(
    @Query(new ZodPipe(folderQuerySchema)) query: FolderQueryDto,
    @CurrentUser() userId: UserId,
  ): Promise<LegacyModelsDto> {
    const view = await this.models.execute(userId, this.engine, query.folder ?? null);
    return {
      cliVersion: view.version,
      models: view.models.map(toModelDto),
      permissionModes: view.permissionModes,
    };
  }

  @Get('defaults')
  read(
    @Query(new ZodPipe(folderQuerySchema)) query: FolderQueryDto,
    @CurrentUser() userId: UserId,
  ): Promise<LegacyDefaultsView> {
    return this.defaults.read(userId, query.folder ?? null);
  }

  @Put('defaults')
  saveUser(
    @Body(new ZodPipe(legacyUserDefaultsSchema)) body: LegacyUserDefaultsBody,
    @CurrentUser() userId: UserId,
  ): Promise<LegacyDefaultsView> {
    return this.defaults.save(userId, null, legacyDefaultsOf(body));
  }

  @Put('defaults/folder')
  saveFolder(
    @Body(new ZodPipe(legacyFolderDefaultsSchema)) body: LegacyFolderDefaultsBody,
    @CurrentUser() userId: UserId,
  ): Promise<LegacyDefaultsView> {
    return this.defaults.save(userId, body.folder, legacyDefaultsOf(body));
  }

  @Delete('defaults/folder')
  @HttpCode(204)
  async clearFolder(
    @Query(new ZodPipe(requiredFolderQuerySchema)) query: { folder: string },
    @CurrentUser() userId: UserId,
  ): Promise<void> {
    await this.defaults.clear(userId, query.folder);
  }
}
