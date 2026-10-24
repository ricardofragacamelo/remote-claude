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

/**
 * The help of "Skills", written for somebody who has never seen one (plan 13, B-34, B-39, S-182):
 * what a skill is and where each origin comes from, that turning one off filters context rather than
 * locking a file (D-20's own SDK fact, never a euphemism), and why turning an origin on asks first
 * while turning one off does not (D-20's asymmetry).
 */
export function skillsSectionHelp(t: TFunction): HelpExtra[] {
  return [
    {
      id: 'claude-skill-what',
      heading: t('engines.claude.help.skillWhatHeading'),
      body: t('engines.claude.help.skillWhatBody'),
    },
    {
      id: 'claude-skill-filter',
      heading: t('engines.claude.help.skillFilterHeading'),
      body: t('engines.claude.help.skillFilterBody'),
    },
    {
      id: 'claude-skill-origin',
      heading: t('engines.claude.help.skillOriginHeading'),
      body: t('engines.claude.help.skillOriginBody'),
    },
  ];
}

/**
 * The help of "Project", written for somebody who has never seen `.claude/` before (plan 13, B-40):
 * what `CLAUDE.md` is and where Claude looks for one, what a slash command and a subagent are (and
 * why a subagent's own frontmatter can widen what it may do), what an output style changes, what a
 * hook actually is — code that runs on this machine, on its own event, nobody approving it here —,
 * and why the project's own permissions apply in the terminal's own Claude Code but not in this
 * product's sessions (the folder's trust mark is cleared before a session opens).
 */
export function projectSectionHelp(t: TFunction): HelpExtra[] {
  return [
    {
      id: 'claude-project-memory',
      heading: t('engines.claude.help.projectMemoryHeading'),
      body: t('engines.claude.help.projectMemoryBody'),
    },
    {
      id: 'claude-project-command',
      heading: t('engines.claude.help.projectCommandHeading'),
      body: t('engines.claude.help.projectCommandBody'),
    },
    {
      id: 'claude-project-subagent',
      heading: t('engines.claude.help.projectSubagentHeading'),
      body: t('engines.claude.help.projectSubagentBody'),
    },
    {
      id: 'claude-project-output-style',
      heading: t('engines.claude.help.projectOutputStyleHeading'),
      body: t('engines.claude.help.projectOutputStyleBody'),
    },
    {
      id: 'claude-project-hook',
      heading: t('engines.claude.help.projectHookHeading'),
      body: t('engines.claude.help.projectHookBody'),
    },
    {
      id: 'claude-project-permissions',
      heading: t('engines.claude.help.projectPermissionsHeading'),
      body: t('engines.claude.help.projectPermissionsBody'),
    },
  ];
}
