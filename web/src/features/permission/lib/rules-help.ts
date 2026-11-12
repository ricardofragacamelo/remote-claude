import type { TFunction } from 'i18next';

import type { HelpExtra } from '@/shared/components/HelpPanel';
import type { RulesHelpExtra } from './rules-help-extras';

/**
 * The rules screen's own help, besides the three fixed parts (what/states/notRecorded, written in
 * `rules.help.*`): Allow × Block and its precedence, where a rule reaches, the read-only mode, what a
 * shell prefix does and does not reach ([D-07](../../../../../docs/plans/15-rules-management/decisions.md#d-07--comando-composto-e-o-prefixo)),
 * that a block is a speed bump and never a sandbox (D-07, without euphemism), what goes to the trail,
 * and why a disabled rule answers nothing (plan 15, B-26).
 *
 * `extras` is whatever an engine's own extension registered — what it decides before these rules are
 * ever asked (D-06) — appended after the core's own, never replacing them.
 */
export function rulesScreenHelp(t: TFunction, extras: readonly RulesHelpExtra[] = []): HelpExtra[] {
  return [
    {
      id: 'rules-precedence',
      heading: t('rules.help.precedenceHeading'),
      body: t('rules.help.precedenceBody'),
    },
    {
      id: 'rules-scope',
      heading: t('rules.help.scopeHeading'),
      body: t('rules.help.scopeBody'),
    },
    {
      id: 'rules-readonly',
      heading: t('rules.help.readOnlyHeading'),
      body: t('rules.help.readOnlyBody'),
    },
    {
      id: 'rules-pattern',
      heading: t('rules.help.patternHeading'),
      body: t('rules.help.patternBody'),
    },
    {
      id: 'rules-sandbox',
      heading: t('rules.help.sandboxHeading'),
      body: t('rules.help.sandboxBody'),
    },
    {
      id: 'rules-recorded',
      heading: t('rules.help.recordedHeading'),
      body: t('rules.help.recordedBody'),
    },
    {
      id: 'rules-disabled',
      heading: t('rules.help.disabledHeading'),
      body: t('rules.help.disabledBody'),
    },
    {
      id: 'rules-export',
      heading: t('rules.export.button'),
      body: t('rules.export.help'),
    },
    ...extras.map((extra) => extra.help(t)),
  ];
}
