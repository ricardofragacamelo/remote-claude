/**
 * The i18n key of each `kind` this build has a translated label for, named in full so the i18n
 * check sees every key (the same reason `STATUS_KEYS` of the MCP screen is written this way).
 */
const WINDOW_KEYS: Readonly<Record<string, string>> = {
  five_hour: 'engines.claude.usage.window.fiveHour',
  seven_day: 'engines.claude.usage.window.sevenDay',
  seven_day_opus: 'engines.claude.usage.window.sevenDayOpus',
  seven_day_sonnet: 'engines.claude.usage.window.sevenDaySonnet',
  seven_day_overage_included: 'engines.claude.usage.window.sevenDayOverageIncluded',
  seven_day_oauth_apps: 'engines.claude.usage.window.sevenDayOauthApps',
  overage: 'engines.claude.usage.window.overage',
};

/**
 * The i18n key of a window's label, or `null` for a `kind` the CLI added after this build — shown
 * by its own raw name then, never hidden (the same survival rule the backend's mapper follows for a
 * message variant it does not recognise).
 */
export function rateLimitWindowLabelKey(kind: string): string | null {
  return WINDOW_KEYS[kind] ?? null;
}

/** The order the known windows are shown in — an unknown `kind` sorts after all of these. */
const ORDER = ['five_hour', 'seven_day', 'seven_day_opus', 'seven_day_sonnet', 'overage'];

/** Windows in a stable, human order: the known ones first, as the account panel lists them. */
export function orderedByKind<T extends { readonly kind: string }>(windows: readonly T[]): T[] {
  const rank = (kind: string): number => {
    const found = ORDER.indexOf(kind);
    return found === -1 ? ORDER.length : found;
  };

  return [...windows].sort((a, b) => rank(a.kind) - rank(b.kind) || a.kind.localeCompare(b.kind));
}
