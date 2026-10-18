import { api } from '@/shared/api/api';
import type {
  ComponentVersion,
  EngineVersions,
  EngineVersionsState,
  InstallationVersions,
  VersionUnavailableReason,
} from '../types/about';

/** One component, as `GET /diag/versions` answers it. */
type ComponentVersionDto = { readonly version?: unknown; readonly reason?: unknown } | undefined;

/** One engine, as `GET /diag/versions` lists it — a line per engine enabled (plan 28, B-37). */
interface EngineVersionsDto {
  readonly engine?: unknown;
  readonly displayName?: unknown;
  readonly state?: unknown;
  readonly binary?: ComponentVersionDto;
  readonly library?: ComponentVersionDto | null;
}

/** The shape `GET /diag/versions` answers with. It stops existing at the end of this file. */
interface VersionsDto {
  readonly backend?: ComponentVersionDto;
  readonly node?: ComponentVersionDto;
  readonly engines?: readonly EngineVersionsDto[];
}

const REASONS: readonly VersionUnavailableReason[] = ['notInstalled', 'unreadable'];
const STATES: readonly EngineVersionsState[] = ['available', 'unavailable'];

/**
 * One component, read defensively: a version is text, and anything else is "could not be read" —
 * the screen exists precisely for when something is wrong, and a malformed answer is one more thing
 * wrong, not a blank screen.
 */
function toComponentVersion(dto: ComponentVersionDto): ComponentVersion {
  if (typeof dto?.version === 'string' && dto.version !== '') {
    return { version: dto.version, reason: null };
  }

  const reason = REASONS.find((known) => known === dto?.reason) ?? 'unreadable';
  return { version: null, reason };
}

/** One engine, read as defensively as a component — an id or a name that is not text is empty. */
function toEngineVersions(dto: EngineVersionsDto): EngineVersions {
  return {
    engine: typeof dto.engine === 'string' ? dto.engine : '',
    displayName: typeof dto.displayName === 'string' ? dto.displayName : '',
    state: STATES.find((known) => known === dto.state) ?? 'unavailable',
    binary: toComponentVersion(dto.binary),
    library: dto.library == null ? null : toComponentVersion(dto.library),
  };
}

/**
 * The versions of this installation: the backend, Node, and each engine enabled — its own binary
 * and the library it drives it through (plan 06, B-12; plan 28, B-37). The web's own version is not
 * asked for — it is the version of this bundle.
 *
 * @throws {import('@/shared/api/errors').AppError} never a raw `Response`
 */
export async function fetchVersions(): Promise<InstallationVersions> {
  const dto = await api.get<VersionsDto>('/diag/versions');

  return {
    backend: toComponentVersion(dto.backend),
    node: toComponentVersion(dto.node),
    engines: (dto.engines ?? []).map(toEngineVersions),
  };
}
