import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';

import { createI18n } from '@/shared/i18n';
import { rulesScreenHelp } from '@/features/permission/lib/rules-help';

const en = createI18n('en').t as TFunction;
const pt = createI18n('pt-BR').t as TFunction;

const CORE_IDS = [
  'rules-precedence',
  'rules-scope',
  'rules-readonly',
  'rules-pattern',
  'rules-sandbox',
  'rules-recorded',
  'rules-disabled',
];

/**
 * The rules screen's own help topics (plan 15, B-26): Allow × Block and its precedence, where a
 * rule reaches, the read-only mode, what a shell prefix does and does not reach (D-07), that a
 * block is a speed bump and never a sandbox, what goes to the trail, and disabled rules.
 */
describe('rulesScreenHelp — written for somebody who has never seen the screen', () => {
  it('has the seven core topics, each with a unique id, when no engine adds its own', () => {
    expect(rulesScreenHelp(en).map((entry) => entry.id)).toEqual(CORE_IDS);
  });

  it('explains Allow and Block, and that any block that matches wins', () => {
    const [precedence] = rulesScreenHelp(en);

    expect(precedence?.heading).toBe(en('rules.help.precedenceHeading'));
    expect(precedence?.body).toBe(en('rules.help.precedenceBody'));
    expect(precedence?.body).toMatch(/block that matches wins/i);
  });

  it('explains that a project rule reaches its subfolders too, per D-10', () => {
    const [, scope] = rulesScreenHelp(en);

    expect(scope?.heading).toBe(en('rules.help.scopeHeading'));
    expect(scope?.body).toMatch(/subfolders/i);
  });

  it('explains the read-only mode, with the agent placeholder resolved', () => {
    const [, , readOnly] = rulesScreenHelp(en);

    expect(readOnly?.body).toBe(en('rules.help.readOnlyBody'));
    expect(readOnly?.body).not.toContain('{{agent}}');
  });

  it('explains what a shell prefix allow does not reach, and what a block of it matches', () => {
    const [, , , pattern] = rulesScreenHelp(en);

    expect(pattern?.body).toMatch(/chained command/i);
    expect(pattern?.body).toMatch(/any segment/i);
  });

  it('says, without euphemism, that a block is a speed bump and not a sandbox', () => {
    const [, , , , sandbox] = rulesScreenHelp(en);

    expect(sandbox?.heading).toBe(en('rules.help.sandboxHeading'));
    expect(sandbox?.body).toMatch(/speed bump/i);
    expect(sandbox?.body).toMatch(/not a sandbox/i);
  });

  it('lists what goes to the trail, and what records nothing', () => {
    const [, , , , , recorded] = rulesScreenHelp(en);

    expect(recorded?.body).toMatch(/audit trail/i);
    expect(recorded?.body).toMatch(/record nothing/i);
  });

  it('explains a disabled rule, and what Recriar opens', () => {
    const [, , , , , , disabled] = rulesScreenHelp(en);

    expect(disabled?.heading).toBe(en('rules.help.disabledHeading'));
    expect(disabled?.body).toMatch(/answers nothing/i);
  });

  it('is translated in pt-BR too, by the same ids', () => {
    expect(rulesScreenHelp(pt).map((entry) => entry.id)).toEqual(CORE_IDS);
    expect(rulesScreenHelp(pt)[0]?.heading).toBe(pt('rules.help.precedenceHeading'));
  });

  it('appends every engine extra after the core topics, never replacing them', () => {
    const extra = {
      id: 'claude.rulesPrecedence',
      engine: 'claude',
      position: 100,
      help: (t: TFunction) => ({ id: 'claude-rules-precedence', heading: t('x'), body: t('y') }),
    };

    const entries = rulesScreenHelp(en, [extra]);

    expect(entries).toHaveLength(CORE_IDS.length + 1);
    expect(entries.map((entry) => entry.id)).toEqual([...CORE_IDS, 'claude-rules-precedence']);
  });
});
