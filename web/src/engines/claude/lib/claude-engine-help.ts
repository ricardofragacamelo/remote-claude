import type { TFunction } from 'i18next';

import type { HelpExtra } from '@/shared/components/HelpPanel';

/** The help of "Conta" — who Claude bills on this machine, written for somebody new (plan 13, B-17). */
export function accountSectionHelp(t: TFunction): readonly HelpExtra[] {
  return [
    {
      id: 'claude-account',
      heading: t('engines.claude.help.accountHeading'),
      body: t('engines.claude.help.accountBody'),
    },
  ];
}

/** The help of "Instalação" — what the test of the connection spends, before it runs (plan 13, B-17). */
export function installationSectionHelp(t: TFunction): readonly HelpExtra[] {
  return [
    {
      id: 'claude-check',
      heading: t('engines.claude.help.checkHeading'),
      body: t('engines.claude.help.checkBody'),
    },
  ];
}

/** The help of the output style — the one field this extension adds to the core's defaults form. */
export function outputStyleHelp(t: TFunction): HelpExtra {
  return {
    id: 'claude-outputStyle',
    heading: t('engines.claude.help.outputStyleHeading'),
    body: t('engines.claude.help.outputStyleBody'),
  };
}
