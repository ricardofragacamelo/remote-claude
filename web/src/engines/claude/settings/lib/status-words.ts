import type { PluginOrigin, PluginState } from '../types/plugin';

/** The origin column — named in full so the i18n check sees every key (S-137). */
export const ORIGIN_KEYS: Readonly<Record<PluginOrigin, string>> = {
  local: 'engines.claude.plugins.originLocal',
  marketplace: 'engines.claude.plugins.originMarketplace',
};

/** The state a plugin's own manifest is in, against what was approved (D-73). */
export const STATE_KEYS: Readonly<Record<PluginState, string>> = {
  current: 'engines.claude.plugins.stateCurrent',
  changed: 'engines.claude.plugins.stateChanged',
  unreadable: 'engines.claude.plugins.stateUnreadable',
  marketplaceNotAllowed: 'engines.claude.plugins.stateMarketplaceNotAllowed',
};
