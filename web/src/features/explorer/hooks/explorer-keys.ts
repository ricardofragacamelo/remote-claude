/**
 * The keys of the Explorer's server data in the query cache — in one place, so an invalidation is
 * never a guess (docs/architecture/web/04-state-and-data.md#chaves-hierárquicas-em-um-lugar-só).
 * Keyed by the folder of the tab first: two tabs never share a level, even of the same path.
 */
export const explorerKeys = {
  all: ['explorer'] as const,
  folder: (folder: string) => [...explorerKeys.all, folder] as const,
  directories: (folder: string) => [...explorerKeys.folder(folder), 'directory'] as const,
  directory: (folder: string, path: string) => [...explorerKeys.directories(folder), path] as const,
};
