import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import type {
  ClaudePluginDetailPayload,
  ClaudePluginListPayload,
  ClaudePluginPreviewPayload,
} from '@remote-claude/contracts';
import {
  AddLocalPluginUseCase,
  ListPluginsUseCase,
  PreviewLocalPluginUseCase,
  RemovePluginUseCase,
  SetPluginEnabledUseCase,
} from '@application/engines/claude';
import { ZodPipe } from '@shared/validation/zod.pipe';
import type { UserId } from '@domain/auth';
import { BearerAuthGuard, CurrentUser } from '../../auth/bearer.guard';
import {
  localPluginPathSchema,
  setPluginEnabledSchema,
  toPluginDto,
  toPluginListDto,
  toPluginPreviewDto,
  type LocalPluginPathBody,
  type SetPluginEnabledBody,
} from './plugins.dto';

/**
 * `/engines/claude/plugins…` — the store of Claude plugins, local for now (plan 13, B-27; B-47 adds
 * marketplace plugins to the same store and the same routes). Never a core route: a plugin is an
 * idea only Claude has ([28 · D-10](../../../../../../docs/plans/28-agent-neutral-core/decisions.md#f6--extensões-isoladas)).
 *
 * Adding one is a second step in disguise, the same shape as an MCP server (B-18): `preview` first,
 * with the exact path about to be added, showing what the manifest declares before anything is
 * written.
 *
 * | Status | When |
 * |---|---|
 * | `200` | `GET`, `preview`, `PATCH` |
 * | `201` | `POST` — a plugin added (or the existing one, for the same path again — S-130) |
 * | `204` | `DELETE`, always |
 * | `400` | a malformed body |
 * | `401` | no bearer, or an invalid one |
 * | `403` | somebody else's plugin, or the path's own refusals |
 * | `404` | a plugin that does not exist |
 * | `422` | the directory has no plugin manifest, or it does not parse |
 */
@Controller('engines/claude/plugins')
@UseGuards(BearerAuthGuard)
export class PluginsController {
  constructor(
    @Inject(ListPluginsUseCase) private readonly list: ListPluginsUseCase,
    @Inject(PreviewLocalPluginUseCase) private readonly preview: PreviewLocalPluginUseCase,
    @Inject(AddLocalPluginUseCase) private readonly add: AddLocalPluginUseCase,
    @Inject(SetPluginEnabledUseCase) private readonly setEnabled: SetPluginEnabledUseCase,
    @Inject(RemovePluginUseCase) private readonly removePlugin: RemovePluginUseCase,
  ) {}

  @Get()
  async read(@CurrentUser() userId: UserId): Promise<ClaudePluginListPayload> {
    return toPluginListDto(await this.list.execute(userId));
  }

  @Post('preview')
  @HttpCode(200)
  async previewOf(
    @Body(new ZodPipe(localPluginPathSchema)) body: LocalPluginPathBody,
    @CurrentUser() userId: UserId,
  ): Promise<ClaudePluginPreviewPayload> {
    return toPluginPreviewDto(await this.preview.execute(userId, body.path));
  }

  @Post()
  @HttpCode(201)
  async addLocal(
    @Body(new ZodPipe(localPluginPathSchema)) body: LocalPluginPathBody,
    @CurrentUser() userId: UserId,
  ): Promise<ClaudePluginDetailPayload> {
    return toPluginDto(await this.add.execute(userId, body.path));
  }

  @Patch(':id')
  async toggle(
    @Param('id') id: string,
    @Body(new ZodPipe(setPluginEnabledSchema)) body: SetPluginEnabledBody,
    @CurrentUser() userId: UserId,
  ): Promise<ClaudePluginDetailPayload> {
    return toPluginDto(await this.setEnabled.execute(userId, id, body.enabled));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() userId: UserId): Promise<void> {
    await this.removePlugin.execute(userId, id);
  }
}
