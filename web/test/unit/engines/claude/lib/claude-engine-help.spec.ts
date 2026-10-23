import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';

import { createI18n } from '@/shared/i18n';
import { pluginsSectionHelp } from '@/engines/claude/lib/claude-engine-help';

const en = createI18n('en').t as TFunction;
const pt = createI18n('pt-BR').t as TFunction;

/**
 * The help of "Plugins" (plan 13, B-30, S-138) — Claude's own extension, so it names Claude by its
 * own name, the same convention `accountSectionHelp`/`installationSectionHelp` already have, never
 * `{{agent}}`.
 */
describe('pluginsSectionHelp — written for somebody who has never seen a plugin', () => {
  it('has one entry per topic the plan names, each with a unique id', () => {
    const entries = pluginsSectionHelp(en);

    expect(entries.map((entry) => entry.id)).toEqual([
      'claude-plugin-what',
      'claude-plugin-marketplace',
    ]);
  });

  it('explains what a plugin can bring, and that its MCP servers never start on their own', () => {
    const [what] = pluginsSectionHelp(en);

    expect(what?.heading).toBe(en('engines.claude.help.pluginWhatHeading'));
    expect(what?.body).toBe(en('engines.claude.help.pluginWhatBody'));
    expect(what?.body).toMatch(/hooks/i);
    expect(what?.body).toMatch(/never start/i);
  });

  it('explains what a marketplace is, and that only declared ones show up', () => {
    const [, marketplace] = pluginsSectionHelp(en);

    expect(marketplace?.heading).toBe(en('engines.claude.help.pluginMarketplaceHeading'));
    expect(marketplace?.body).toBe(en('engines.claude.help.pluginMarketplaceBody'));
    expect(marketplace?.body).toMatch(/allowlist/i);
  });

  it('is translated in pt-BR too, by the same ids', () => {
    const entries = pluginsSectionHelp(pt);

    expect(entries.map((entry) => entry.id)).toEqual([
      'claude-plugin-what',
      'claude-plugin-marketplace',
    ]);
    expect(entries[0]?.heading).toBe(pt('engines.claude.help.pluginWhatHeading'));
    expect(entries[1]?.body).toBe(pt('engines.claude.help.pluginMarketplaceBody'));
  });
});
