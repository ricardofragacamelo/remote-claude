import { api } from '@/shared/api/api';
import { INSTALLATION_COMPONENTS } from '../types/about';
import type {
  ComponentVersion,
  InstallationVersions,
  VersionUnavailableReason,
} from '../types/about';

/** The shape `GET /diag/versions` answers with. It stops existing at the end of this file. */
type VersionsDto = Readonly<Record<string, { version?: unknown; reason?: unknown } | undefined>>;

const REASONS: readonly VersionUnavailableReason[] = ['notInstalled', 'unreadable'];

/**
 * One component, read defensively: a version is text, and anything else is "could not be read" —
 * the screen exists precisely for when something is wrong, and a malformed answer is one more thing
 * wrong, not a blank screen.
 */
function toComponentVersion(dto: VersionsDto[string]): ComponentVersion {
  if (typeof dto?.version === 'string' && dto.version !== '') {
    return { version: dto.version, reason: null };
  }

  const reason = REASONS.find((known) => known === dto?.reason) ?? 'unreadable';
  return { version: null, reason };
}

/**
 * The versions of this installation: the backend, the Agent SDK, Claude's CLI and Node (plan 06,
 * B-12). The web's own version is not asked for — it is the version of this bundle.
 *
 * @throws {import('@/shared/api/errors').AppError} never a raw `Response`
 */
export async function fetchVersions(): Promise<InstallationVersions> {
  const dto = await api.get<VersionsDto>('/diag/versions');

  return Object.fromEntries(
    INSTALLATION_COMPONENTS.map((component) => [component, toComponentVersion(dto[component])]),
  ) as InstallationVersions;
}
