import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';

import { createI18n } from '@/shared/i18n';
import { pluginsSectionHelp, rulesSectionHelp } from '@/engines/claude/lib/claude-engine-help';

const en = createI18n('en').t as TFunction;
const pt = createI18n('pt-BR').t as TFunction;

/**
 * The rules screen's own addition (plan 15, B-26) — what Claude decides before these rules are ever
 * asked: a project's own `deny` still applying, its `allow` not; accept-edits; reads approved on
 * their own.
 */
describe('rulesSectionHelp — what Claude decides before the rules screen', () => {
  it('has its own id', () => {
    expect(rulesSectionHelp(en).id).toBe('claude-rules-precedence');
  });

  it('says a project’s own deny still applies, its allow does not', () => {
    const entry = rulesSectionHelp(en);

    expect(entry.heading).toBe(en('engines.claude.help.rulesPrecedenceHeading'));
    expect(entry.body).toBe(en('engines.claude.help.rulesPrecedenceBody'));
    expect(entry.body).toMatch(/deny.*still applies/i);
    expect(entry.body).toMatch(/allow.*does not/i);
  });

  it('is translated in pt-BR too, by the same id', () => {
    const entry = rulesSectionHelp(pt);

    expect(entry.id).toBe('claude-rules-precedence');
    expect(entry.heading).toBe(pt('engines.claude.help.rulesPrecedenceHeading'));
    expect(entry.body).toBe(pt('engines.claude.help.rulesPrecedenceBody'));
  });
});

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
