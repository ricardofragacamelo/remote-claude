import { Blocks, Bot, FolderCog, Puzzle, Wrench } from 'lucide-react';

import { commandHosts } from '@/app/command-hosts';
import { NAVIGATION_POSITIONS, globalNavigation } from '@/app/global-navigation';
import {
  Nothing,
  agentSettingsHref,
  agentSettingsSections,
  agentSettingsShortcuts,
  defaultsExtraFields,
} from '@/features/agent-settings';
import { sensitiveFiles } from '@/shared/lib/sensitive-files';
import { AccountSection } from './components/AccountSection';
import { ClaudeShortcuts } from './components/ClaudeShortcuts';
import { InstallationSection } from './components/InstallationSection';
import { useOutputStyle } from './hooks/useOutputStyle';
import {
  accountSectionHelp,
  installationSectionHelp,
  outputStyleHelp,
} from './lib/claude-engine-help';
import { PluginsSection } from './settings';

/** The engine this extension is — never read outside this folder (ADR-025). */
const ENGINE = 'claude';

/**
 * Puts Claude's extension in the places of the core it fills (plan 28, B-36, B-38): its own sections
 * of the engine settings screen (account, installation; plugins, skills and the `.claude/` of a
 * project, bodies still to come), the output style it adds to the core's defaults form, its place in
 * the global navigation, and the two shortcuts of its screen.
 *
 * Imported once, for the side effect, by `web/src/app/engines/index.ts` — the one file of the core allowed
 * to know this folder exists.
 *
 * @returns the way to take it all back out — what a test does to see it registered again
 */
export function registerClaudeEngine(): () => void {
  const undo = [
    agentSettingsSections.register({
      id: 'account',
      engine: ENGINE,
      position: 100,
      icon: Bot,
      titleKey: 'engines.claude.account.title',
      purposeKey: 'engines.claude.account.purpose',
      Body: AccountSection,
      help: accountSectionHelp,
    }),
    agentSettingsSections.register({
      id: 'installation',
      engine: ENGINE,
      position: 200,
      icon: Wrench,
      titleKey: 'engines.claude.installation.title',
      purposeKey: 'engines.claude.installation.purpose',
      Body: InstallationSection,
      help: installationSectionHelp,
    }),
    agentSettingsSections.register({
      id: 'plugins',
      engine: ENGINE,
      position: 500,
      icon: Puzzle,
      titleKey: 'engines.claude.plugins.title',
      purposeKey: 'engines.claude.plugins.purpose',
      Body: PluginsSection,
    }),
    agentSettingsSections.register({
      id: 'skills',
      engine: ENGINE,
      position: 600,
      icon: Blocks,
      titleKey: 'engines.claude.skills.title',
      purposeKey: 'engines.claude.skills.purpose',
      Body: Nothing,
    }),
    agentSettingsSections.register({
      id: 'project',
      engine: ENGINE,
      position: 700,
      icon: FolderCog,
      titleKey: 'engines.claude.project.title',
      purposeKey: 'engines.claude.project.purpose',
      Body: Nothing,
    }),
    defaultsExtraFields.register({
      id: 'claude.outputStyle',
      engine: ENGINE,
      position: 100,
      labelKey: 'engines.claude.defaults.outputStyle',
      useField: useOutputStyle,
      help: outputStyleHelp,
    }),
    globalNavigation.register({
      // How the agent works on this machine (plan 13): a screen of its own, never a section of the
      // app's Settings (13 · D-09, D-27). `sections` is a full prefix, not just the first segment —
      // `/settings/agents/claude` would otherwise light the app's own Settings entry too, both
      // starting with `settings` (plan 28, B-38, S-111).
      id: 'claude',
      position: NAVIGATION_POSITIONS.agents,
      labelKey: 'engines.claude.navigation.entry',
      icon: Bot,
      href: () => agentSettingsHref({ engine: ENGINE }),
      sections: ['settings/agents'],
    }),
    commandHosts.register({ id: ENGINE, position: 100, component: ClaudeShortcuts }),
    sensitiveFiles.register({
      id: 'claude.projectSettings',
      position: 100,
      path: '.claude/settings.json',
      subject: 'projectSettings',
    }),
    sensitiveFiles.register({
      id: 'claude.localSettings',
      position: 200,
      path: '.claude/settings.local.json',
      subject: 'localSettings',
    }),
    sensitiveFiles.register({
      id: 'claude.mcpServers',
      position: 300,
      path: '.mcp.json',
      subject: 'mcpServers',
    }),
    agentSettingsShortcuts.register({
      id: 'claude.defaultModel',
      position: 100,
      engine: ENGINE,
      commandId: 'agent.defaultModel',
    }),
    agentSettingsShortcuts.register({
      id: 'claude.testConnection',
      position: 200,
      engine: ENGINE,
      commandId: 'agent.testConnection',
    }),
  ];

  return () => {
    for (const each of undo) {
      each();
    }
  };
}

/** Takes Claude's extension back out — what a test does to see it registered again. */
export const unregisterClaudeEngine = registerClaudeEngine();
