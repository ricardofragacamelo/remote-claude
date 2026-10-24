/** The query keys of this screen's reads — one list, one preferences view, each keyed by folder. */
export const skillKeys = {
  all: ['claude', 'skills'] as const,
  list: (folder: string) => [...skillKeys.all, 'list', folder] as const,
  preferences: (folder: string) => [...skillKeys.all, 'preferences', folder] as const,
};
