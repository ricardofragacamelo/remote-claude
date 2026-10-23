/** Where the answers of the plugins screen are kept in the query cache (plan 13, B-29). */
export const pluginKeys = {
  all: ['engines', 'claude', 'plugins'] as const,
  list: () => [...pluginKeys.all, 'list'] as const,
  marketplaces: () => [...pluginKeys.all, 'marketplaces'] as const,
  marketplaceCatalog: (name: string) => [...pluginKeys.all, 'marketplace', name] as const,
};
