import { Controller, Get, Inject, UseGuards } from '@nestjs/common';

import { ReadVersionsUseCase } from '@application/diag';
import type { ComponentVersion, VersionUnavailableReason } from '@application/diag';
import { BearerAuthGuard } from '../auth/bearer.guard';

/** One component's version as the client reads it: the number, or `null` and why. */
export interface ComponentVersionDto {
  readonly version: string | null;
  readonly reason: VersionUnavailableReason | null;
}

/**
 * `GET /diag/versions`: what somebody pastes into a bug report.
 *
 * `web` is left out: the screen shows the version of its own bundle, which the backend does not
 * know (docs/architecture/backend/03-modules.md#diag).
 */
export interface VersionsDto {
  readonly backend: ComponentVersionDto;
  readonly agentSdk: ComponentVersionDto;
  readonly claudeCli: ComponentVersionDto;
  readonly node: ComponentVersionDto;
}

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
  read(): VersionsDto {
    const versions = this.versions.execute();

    return {
      backend: toDto(versions.backend),
      agentSdk: toDto(versions.agentSdk),
      claudeCli: toDto(versions.claudeCli),
      node: toDto(versions.node),
    };
  }
}

function toDto(component: ComponentVersion): ComponentVersionDto {
  return { version: component.version, reason: component.reason };
}
