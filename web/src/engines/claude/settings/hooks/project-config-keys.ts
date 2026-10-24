/** Where this screen's one read is kept in the query cache. */
export const projectConfigKeys = {
  all: ['claude', 'project-config'] as const,
  of: (folder: string) => [...projectConfigKeys.all, folder] as const,
};
