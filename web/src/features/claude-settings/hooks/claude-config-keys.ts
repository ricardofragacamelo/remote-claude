/** Where the answers of the configuration of Claude are kept in the query cache. */
export const claudeConfigKeys = {
  all: ['claude-config'] as const,
  account: () => [...claudeConfigKeys.all, 'account'] as const,
  installation: () => [...claudeConfigKeys.all, 'installation'] as const,
  models: (folder: string | undefined) =>
    [...claudeConfigKeys.all, 'models', folder ?? ''] as const,
  defaults: (folder: string | undefined) =>
    [...claudeConfigKeys.all, 'defaults', folder ?? ''] as const,
};
