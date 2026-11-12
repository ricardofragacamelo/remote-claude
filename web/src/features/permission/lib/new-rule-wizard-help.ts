import type { TFunction } from 'i18next';

import type { HelpExtra } from '@/shared/components/HelpPanel';

/**
 * The wizard's own help, besides the three fixed parts (`rules.wizardHelp.what`/`states`/
 * `notRecorded`): the canonical grammar's own shape, and why a width the server calls `unbounded`
 * is never offered a way past it (D-09) — written for somebody who has never typed a shell command
 * on purpose, since that is exactly who a rule this wide would surprise (plan 15, B-32).
 */
export function newRuleWizardHelp(t: TFunction): HelpExtra[] {
  return [
    {
      id: 'new-rule-pattern-examples',
      heading: t('rules.wizardHelp.patternExamplesHeading'),
      body: t('rules.wizardHelp.patternExamplesBody'),
    },
    {
      id: 'new-rule-width',
      heading: t('rules.wizardHelp.widthHeading'),
      body: t('rules.wizardHelp.widthBody'),
    },
  ];
}
