import type { DirectoryQuery } from '../types/workspace';

/**
 * The query keys of the feature, in one place.
 *
 * A key spelled at each call site turns invalidation into guesswork; `workspaceKeys.all` drops the
 * whole tree at once (docs/architecture/web/04-state-and-data.md#chaves-hierárquicas-em-um-lugar-só).
 * A listing is keyed by everything it was asked — path, dot-folders and prefix — so an answer can
 * never land under a question it was not the answer to (plan 06, S-77).
 */
export const workspaceKeys = {
  all: ['workspaces'] as const,
  roots: () => [...workspaceKeys.all, 'roots'] as const,
  resolve: (path: string) => [...workspaceKeys.all, 'resolve', path] as const,
  directories: (request: DirectoryQuery) =>
    [
      ...workspaceKeys.all,
      'directories',
      request.path,
      request.hidden,
      request.prefix ?? '',
    ] as const,
  recent: () => [...workspaceKeys.all, 'recent'] as const,
  openFolders: () => [...workspaceKeys.all, 'open-folders'] as const,
};
