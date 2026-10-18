import { Controller, Get, Inject, UseGuards } from '@nestjs/common';

import type {
  ComponentVersion as ComponentVersionPayload,
  VersionsPayload,
} from '@remote-claude/contracts';

import { ReadVersionsUseCase } from '@application/diag';
import type { ComponentVersion, EngineVersions } from '@application/diag';
import { BearerAuthGuard } from '../auth/bearer.guard';

/**
 * The versions of this installation, for the "About" screen (plan 06, B-12).
 *
 * Authenticated, unlike `GET /health`: the versions of what runs on a machine are a map for whoever
 * probes it. And always `200` — a version that could not be read is `null` with the reason, never a
 * `500`, because the screen exists precisely for when something is wrong.
 */
@Controller('diag')
@UseGuards(BearerAuthGuard)
export class DiagController {
  constructor(@Inject(ReadVersionsUseCase) private readonly versions: ReadVersionsUseCase) {}

  @Get('versions')
  read(): VersionsPayload {
    const versions = this.versions.execute();

    return {
      backend: toDto(versions.backend),
      node: toDto(versions.node),
      defaultEngine: versions.defaultEngine,
      engines: versions.engines.map(toEngineDto),
    };
  }
}

function toDto(component: ComponentVersion): ComponentVersionPayload {
  return { version: component.version, reason: component.reason };
}

function toEngineDto(engine: EngineVersions): VersionsPayload['engines'][number] {
  return {
    engine: engine.engine,
    displayName: engine.displayName,
    state: engine.state,
    binary: toDto(engine.binary),
    library: engine.library === null ? null : toDto(engine.library),
  };
}
