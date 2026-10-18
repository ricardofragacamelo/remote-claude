/** Where the answers of Claude's own extension are kept in the query cache. */
export const claudeEngineKeys = {
  all: ['engines', 'claude'] as const,
  account: () => [...claudeEngineKeys.all, 'account'] as const,
  installation: () => [...claudeEngineKeys.all, 'installation'] as const,
  outputStyle: (folder: string | undefined) =>
    [...claudeEngineKeys.all, 'output-style', folder ?? ''] as const,
};
