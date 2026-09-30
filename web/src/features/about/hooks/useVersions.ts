import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import type { AppError } from '@/shared/api/errors';
import { config } from '@/shared/config/env';
import { useCopy } from '@/shared/hooks/useCopy';
import type { CopyState } from '@/shared/hooks/useCopy';
import { fetchVersions } from '../services/about.service';
import { INSTALLATION_COMPONENTS } from '../types/about';
import type { ComponentVersion, InstallationComponent, InstallationVersions } from '../types/about';

/** Where the versions are kept in the cache — they change only when the installation does. */
export const versionKeys = { all: ['diag', 'versions'] as const };

/** Every component, in the order the screen and the report list them — the web first. */
export const REPORTED = ['web', ...INSTALLATION_COMPONENTS] as const;

export type ReportedComponent = (typeof REPORTED)[number];

/** The versions, the four states of reading them, and the block a bug report takes. */
export interface Versions {
  /** The web's own version — the bundle on screen, known whatever the backend answers. */
  readonly web: string;
  readonly installation: InstallationVersions | null;
  readonly isLoading: boolean;
  readonly error: AppError | null;
  reload(): void;

  /** Copies the whole block, in the language on screen. */
  copy(): void;
  readonly copyState: CopyState;
}

/** Each component's name, named in full so the orphan check sees them in use. */
const NAMES: Readonly<Record<ReportedComponent, string>> = {
  web: 'about.version.web',
  backend: 'about.version.backend',
  agentSdk: 'about.version.agentSdk',
  claudeCli: 'about.version.claudeCli',
  node: 'about.version.node',
};

/** Why a version is missing, named in full for the same reason. */
const REASONS = {
  notInstalled: 'about.version.notInstalled',
  unreadable: 'about.version.unreadable',
} as const;

/**
 * The versions of this installation, for the About screen and for a bug report (plan 06, B-32).
 *
 * Server data, so it lives in the query cache; it changes only with the installation, so a second
 * visit within the stale time asks nothing. A version the backend could not read is on the list with
 * the reason, never left out — its absence is often the bug (S-204).
 */
export function useVersions(): Versions {
  const { nameOf, valueOf } = useVersionLabels();
  const query = useQuery<InstallationVersions, AppError>({
    queryKey: versionKeys.all,
    queryFn: fetchVersions,
    staleTime: 5 * 60_000,
  });

  const lines = [
    `${nameOf('web')}: ${config.appVersion}`,
    ...(query.data === undefined
      ? []
      : INSTALLATION_COMPONENTS.map(
          (component: InstallationComponent) =>
            `${nameOf(component)}: ${valueOf(query.data[component])}`,
        )),
  ];
  const { state, copy } = useCopy(lines.join('\n'));

  return {
    web: config.appVersion,
    installation: query.data ?? null,
    isLoading: query.isPending,
    error: query.error,
    reload: () => {
      void query.refetch();
    },
    copy: () => {
      copy();
    },
    copyState: state,
  };
}

/** A component's name and the text of its version, as the screen shows them. */
export function useVersionLabels(): {
  nameOf(component: ReportedComponent): string;
  valueOf(version: ComponentVersion): string;
} {
  const { t } = useTranslation();

  return {
    nameOf: (component) => t(NAMES[component]),
    valueOf: (version) => (version.version === null ? t(REASONS[version.reason]) : version.version),
  };
}
