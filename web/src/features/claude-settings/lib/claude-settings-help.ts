import type { TFunction } from 'i18next';

import type { HelpExtra } from '@/shared/components/HelpPanel';

/**
 * The parts of the help of "Configuração do Claude" beyond the three every screen has — one per
 * field people stop at, each the target of its "learn more" (plan 13, B-17). Written for somebody who
 * has never seen the product; every key named in full.
 */
export function claudeSettingsHelp(t: TFunction): HelpExtra[] {
  return [
    {
      id: 'claude-account',
      heading: t('claudeSettings.help.accountHeading'),
      body: t('claudeSettings.help.accountBody'),
    },
    {
      id: 'claude-check',
      heading: t('claudeSettings.help.checkHeading'),
      body: t('claudeSettings.help.checkBody'),
    },
    {
      id: 'claude-model',
      heading: t('claudeSettings.help.modelHeading'),
      body: t('claudeSettings.help.modelBody'),
    },
    {
      id: 'claude-modes',
      heading: t('claudeSettings.help.modesHeading'),
      body: t('claudeSettings.help.modesBody'),
    },
    {
      id: 'claude-effort',
      heading: t('claudeSettings.help.effortHeading'),
      body: t('claudeSettings.help.effortBody'),
    },
    {
      id: 'claude-thinking',
      heading: t('claudeSettings.help.thinkingHeading'),
      body: t('claudeSettings.help.thinkingBody'),
    },
    {
      id: 'claude-outputStyle',
      heading: t('claudeSettings.help.outputStyleHeading'),
      body: t('claudeSettings.help.outputStyleBody'),
    },
  ];
}
