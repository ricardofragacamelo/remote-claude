/** Where the answers of an engine's settings are kept in the query cache. */
export const agentSettingsKeys = {
  all: (engine: string) => ['agent-settings', engine] as const,
  models: (engine: string, folder: string | undefined) =>
    [...agentSettingsKeys.all(engine), 'models', folder ?? ''] as const,
  defaults: (engine: string, folder: string | undefined) =>
    [...agentSettingsKeys.all(engine), 'defaults', folder ?? ''] as const,
};
