import { Body, Controller, Get, Inject, Put, Query, UseGuards } from '@nestjs/common';

import type {
  ClaudeSkillListPayload,
  ClaudeSkillPreferencesPayload,
  ClaudeSkillPreferencesViewPayload,
} from '@remote-claude/contracts';

import {
  ReadProjectSkillsUseCase,
  ReadSkillPreferencesUseCase,
  SaveSkillPreferencesUseCase,
} from '@application/engines/claude';
import type { SkillPreferencesView } from '@application/engines/claude';
import type { UserId } from '@domain/auth';
import {
  folderQuerySchema,
  requiredFolderQuerySchema,
  type FolderQueryDto,
} from '../../agent-settings/agent-settings.dto';
import { BearerAuthGuard, CurrentUser } from '../../auth/bearer.guard';
import { ZodPipe } from '@shared/validation/zod.pipe';
import { skillPreferencesOf, skillPreferencesSchema } from './claude.dto';
import type { SkillPreferencesBody } from './claude.dto';

/**
 * `/engines/claude/skills*` — the skills of the project, the user and the system, and the
 * preferences that turn an origin or one skill on or off (plan 13, B-34; D-20).
 *
 * Every route is Bearer and scoped by who asks; a folder clears the allowlist before anything else.
 *
 * | Status | When |
 * |---|---|
 * | `200` | the answer |
 * | `400` | a malformed query or body, or a skill name outside its form (`INVALID_INPUT`) |
 * | `401` | no bearer, or an invalid one |
 * | `403` | the folder's refusals |
 * | `429` / `502` / `504` | the installation had no slot, failed, or did not answer |
 * | `503` | the trail could not take a change — nothing was saved |
 */
@Controller()
@UseGuards(BearerAuthGuard)
export class SkillsController {
  constructor(
    @Inject(ReadProjectSkillsUseCase) private readonly skills: ReadProjectSkillsUseCase,
    @Inject(ReadSkillPreferencesUseCase)
    private readonly readPreferences: ReadSkillPreferencesUseCase,
    @Inject(SaveSkillPreferencesUseCase)
    private readonly savePreferences: SaveSkillPreferencesUseCase,
  ) {}

  @Get('engines/claude/skills')
  async readSkills(
    @Query(new ZodPipe(requiredFolderQuerySchema)) query: { folder: string },
    @CurrentUser() userId: UserId,
  ): Promise<ClaudeSkillListPayload> {
    return { skills: await this.skills.execute(userId, query.folder) };
  }

  @Get('engines/claude/skills/preferences')
  async readPreferencesRoute(
    @Query(new ZodPipe(folderQuerySchema)) query: FolderQueryDto,
    @CurrentUser() userId: UserId,
  ): Promise<ClaudeSkillPreferencesViewPayload> {
    return skillPreferencesViewDto(
      await this.readPreferences.execute(userId, query.folder ?? null),
    );
  }

  @Put('engines/claude/skills/preferences')
  async savePreferencesRoute(
    @Body(new ZodPipe(skillPreferencesSchema)) body: SkillPreferencesBody,
    @CurrentUser() userId: UserId,
  ): Promise<ClaudeSkillPreferencesPayload> {
    return this.savePreferences.execute(userId, body.folder, skillPreferencesOf(body));
  }
}

/**
 * The view, on the wire — `effective.folder` only present when `from` is `folder`, never the key set
 * to `undefined`: `ResolvedSkillPreferences` reads it straight off `EffectiveValue`'s own optional
 * field, which `exactOptionalPropertyTypes` needs spelled out again here to satisfy the contract.
 */
function skillPreferencesViewDto(view: SkillPreferencesView): ClaudeSkillPreferencesViewPayload {
  return {
    effective: {
      value: view.effective.value,
      from: view.effective.from,
      ...(view.effective.folder === undefined ? {} : { folder: view.effective.folder }),
    },
    user: view.user,
    folder: view.folder,
  };
}
