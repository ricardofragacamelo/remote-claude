import { Controller, Get, Inject, UseGuards } from '@nestjs/common';

import { EngineRegistry } from '@application/session';
import type { EngineDescription } from '@domain/engine';
import type { EngineListPayload, EngineListPayloadEnginesItem } from '@remote-claude/contracts';
import { BearerAuthGuard } from '../auth/bearer.guard';

/** One engine, as `GET /engines` carries it — the contract's type. */
export type EngineDto = EngineListPayloadEnginesItem;

/** The answer of `GET /engines`, in the order the configuration enables them. */
export type EngineListDto = EngineListPayload;

/** [description] on the wire. */
export function toEngineDto(description: EngineDescription): EngineDto {
  return {
    id: description.engine.value,
    displayName: description.displayName,
    state: description.state,
    reason: description.reason,
    version: description.version,
    capabilities: description.capabilities,
  };
}

/**
 * The coding agents this installation drives, and what each can do (plan 28, B-12; ADR-025): what a
 * client names an agent by, and the capabilities before a session exists. Nothing is spawned and no
 * quota is spent; the credential of an engine is never part of the answer.
 *
 * | Status | When |
 * |---|---|
 * | `200` | the engines enabled |
 * | `401` | no bearer, or an invalid one |
 */
@Controller('engines')
@UseGuards(BearerAuthGuard)
export class EnginesController {
  constructor(@Inject(EngineRegistry) private readonly engines: EngineRegistry) {}

  @Get()
  async list(): Promise<EngineListDto> {
    const descriptions = await this.engines.describeAll();
    return {
      defaultEngine: this.engines.default.engine.value,
      engines: descriptions.map(toEngineDto),
    };
  }
}
