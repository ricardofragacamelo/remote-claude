import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import type { AppError } from '@/shared/api/errors';
import { config } from '@/shared/config/env';
import { useCopy } from '@/shared/hooks/useCopy';
import type { CopyState } from '@/shared/hooks/useCopy';
import { fetchVersions } from '../services/about.service';
import type { ComponentVersion, EngineVersions, InstallationVersions } from '../types/about';

/** Where the versions are kept in the cache — they change only when the installation does. */
export const versionKeys = { all: ['diag', 'versions'] as const };

/** One line of the report: a name, already resolved, and its value. */
export interface VersionLine {
  readonly name: string;
  readonly value: string;

  /** `false` when the value is a reason it is missing, not a version — shown as an error. */
  readonly ok: boolean;
}

/** The versions, the four states of reading them, and the block a bug report takes. */
export interface Versions {
  /** The web's own version — the bundle on screen, known whatever the backend answers. */
  readonly web: string;
  readonly installation: InstallationVersions | null;

  /** Every line the screen and the report show, the web's own first. */
  readonly lines: readonly VersionLine[];
  readonly isLoading: boolean;
  readonly error: AppError | null;
  reload(): void;

  /** Copies the whole block, in the language on screen. */
  copy(): void;
  readonly copyState: CopyState;
}

/** Why a version is missing, named in full. */
const REASONS = {
  notInstalled: 'about.version.notInstalled',
  unreadable: 'about.version.unreadable',
} as const;

/** One component, as a line: its value, or the reason it is missing, shown as an error. */
function lineOf(t: TFunction, name: string, version: ComponentVersion): VersionLine {
  return version.version === null
    ? { name, value: t(REASONS[version.reason]), ok: false }
    : { name, value: version.version, ok: true };
}

/** The two or one lines of one engine: its binary, and its library when it has one to report. */
function linesOfEngine(t: TFunction, engine: EngineVersions): readonly VersionLine[] {
  const agent = { agent: engine.displayName };
  const lines = [lineOf(t, t('about.version.binary', agent), engine.binary)];

  return engine.library === null
    ? lines
    : [...lines, lineOf(t, t('about.version.library', agent), engine.library)];
}

/** Every line of the report, in the order the screen shows them: the web first, then the rest. */
function linesOf(
  t: TFunction,
  web: string,
  installation: InstallationVersions | null,
): readonly VersionLine[] {
  const fixed: readonly VersionLine[] = [{ name: t('about.version.web'), value: web, ok: true }];

  if (installation === null) {
    return fixed;
  }

  return [
    ...fixed,
    lineOf(t, t('about.version.backend'), installation.backend),
    ...installation.engines.flatMap((engine) => linesOfEngine(t, engine)),
    lineOf(t, t('about.version.node'), installation.node),
  ];
}

/**
 * The versions of this installation, for the About screen and for a bug report (plan 06, B-32).
 *
 * Server data, so it lives in the query cache; it changes only with the installation, so a second
 * visit within the stale time asks nothing. A version the backend could not read is on the list with
 * the reason, never left out — its absence is often the bug (S-204).
 */
export function useVersions(): Versions {
  const { t } = useTranslation();
  const query = useQuery<InstallationVersions, AppError>({
    queryKey: versionKeys.all,
    queryFn: fetchVersions,
    staleTime: 5 * 60_000,
  });

  const lines = linesOf(t, config.appVersion, query.data ?? null);
  const { state, copy } = useCopy(lines.map((line) => `${line.name}: ${line.value}`).join('\n'));

  return {
    web: config.appVersion,
    installation: query.data ?? null,
    lines,
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
