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

/**
 * The help of "Plugins", written for somebody who has never seen one (plan 13, B-30, S-138): what a
 * plugin can bring — hooks, commands, agents, skills and MCP servers of its own, which never start on
 * their own — and what a marketplace is, and why only the ones this machine's allowlist file declares
 * ever show up here. Claude's own extension, so `engines.claude.*` — never the core's `agentSettings.help`.
 */
export function pluginsSectionHelp(t: TFunction): HelpExtra[] {
  return [
    {
      id: 'claude-plugin-what',
      heading: t('engines.claude.help.pluginWhatHeading'),
      body: t('engines.claude.help.pluginWhatBody'),
    },
    {
      id: 'claude-plugin-marketplace',
      heading: t('engines.claude.help.pluginMarketplaceHeading'),
      body: t('engines.claude.help.pluginMarketplaceBody'),
    },
  ];
}
