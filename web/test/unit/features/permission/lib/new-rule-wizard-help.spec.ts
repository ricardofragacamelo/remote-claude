import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';

import { createI18n } from '@/shared/i18n';
import { newRuleWizardHelp } from '@/features/permission/lib/new-rule-wizard-help';

const en = createI18n('en').t as TFunction;
const pt = createI18n('pt-BR').t as TFunction;

/**
 * The wizard's own two extra help topics (plan 15, B-32): what a pattern looks like, and why an
 * unbounded `allow` is never offered — written for somebody who has never typed a shell command.
 */
describe('newRuleWizardHelp — written for somebody who has never seen the wizard', () => {
  it('has both topics, each with a unique id', () => {
    expect(newRuleWizardHelp(en).map((entry) => entry.id)).toEqual([
      'new-rule-pattern-examples',
      'new-rule-width',
    ]);
  });

  it('shows the bare-kind and the narrowed-subject shape, with a real example of each', () => {
    const [patterns] = newRuleWizardHelp(en);

    expect(patterns?.heading).toBe(en('rules.wizardHelp.patternExamplesHeading'));
    expect(patterns?.body).toMatch(/shell\(git:\*\)/);
    expect(patterns?.body).toMatch(/shell\(git status\)/);
  });

  it('explains why the wizard never offers an unbounded allow, without assuming shell knowledge', () => {
    const [, width] = newRuleWizardHelp(en);

    expect(width?.heading).toBe(en('rules.wizardHelp.widthHeading'));
    expect(width?.body).toMatch(/never offered/i);
    expect(width?.body).toMatch(/narrower pattern/i);
  });

  it('is translated in pt-BR too, by the same ids', () => {
    expect(newRuleWizardHelp(pt).map((entry) => entry.id)).toEqual([
      'new-rule-pattern-examples',
      'new-rule-width',
    ]);
    expect(newRuleWizardHelp(pt)[0]?.heading).toBe(pt('rules.wizardHelp.patternExamplesHeading'));
  });
});
