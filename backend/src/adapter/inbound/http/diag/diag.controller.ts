import { Controller, Get, Inject, UseGuards } from '@nestjs/common';

import { ReadVersionsUseCase } from '@application/diag';
import type {
  ComponentVersion,
  EngineVersions,
  InstallationVersions,
  VersionUnavailableReason,
} from '@application/diag';
import { BearerAuthGuard } from '../auth/bearer.guard';

/** One component's version as the client reads it: the number, or `null` and why. */
export interface ComponentVersionDto {
  readonly version: string | null;
  readonly reason: VersionUnavailableReason | null;
}

/** One engine enabled, as the "About" screen lists it — a line per engine (plan 28, B-37, S-108). */
export interface EngineVersionsDto {
  readonly engine: string;
  readonly displayName: string;
  readonly state: 'available' | 'unavailable';
  readonly binary: ComponentVersionDto;
  readonly library: ComponentVersionDto | null;
}

/**
 * `GET /diag/versions`: what somebody pastes into a bug report.
 *
 * `engines` has a line per engine enabled, and `defaultEngine` names the one a session opens on.
 * `agentSdk` and `claudeCli` are the default engine's library and binary under the names of the
 * previous protocol, kept for its window (`v-1`, until F7).
 *
 * `web` is left out: the screen shows the version of its own bundle, which the backend does not
 * know (docs/architecture/backend/03-modules.md#diag).
 */
export interface VersionsDto {
  readonly backend: ComponentVersionDto;
  readonly agentSdk: ComponentVersionDto;
  readonly claudeCli: ComponentVersionDto;
  readonly node: ComponentVersionDto;
  readonly defaultEngine: string;
  readonly engines: readonly EngineVersionsDto[];
}

/** What is said of a part the default engine does not have. */
const NOT_INSTALLED: ComponentVersionDto = { version: null, reason: 'notInstalled' };

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
    const fallback = defaultEngineOf(versions);

    return {
      backend: toDto(versions.backend),
      agentSdk: fallback?.library == null ? NOT_INSTALLED : toDto(fallback.library),
      claudeCli: fallback === undefined ? NOT_INSTALLED : toDto(fallback.binary),
      node: toDto(versions.node),
      defaultEngine: versions.defaultEngine,
      engines: versions.engines.map(toEngineDto),
    };
  }
}

function toDto(component: ComponentVersion): ComponentVersionDto {
  return { version: component.version, reason: component.reason };
}

/** The line of the engine a session opens on, when it is listed. */
function defaultEngineOf(versions: InstallationVersions): EngineVersions | undefined {
  return versions.engines.find((engine) => engine.engine === versions.defaultEngine);
}

function toEngineDto(engine: EngineVersions): EngineVersionsDto {
  return {
    engine: engine.engine,
    displayName: engine.displayName,
    state: engine.state,
    binary: toDto(engine.binary),
    library: engine.library === null ? null : toDto(engine.library),
  };
}
