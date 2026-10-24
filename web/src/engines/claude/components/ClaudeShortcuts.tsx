import { FileText, Gauge, SquareSlash, Sparkles, Users } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';

import { agentSettingsHref } from '@/features/agent-settings';
import { useCommands } from '@/features/commands';
import type { CommandDeclaration } from '@/features/commands';

/**
 * Shortcuts beyond the generic "go to the engine's settings" the navigation entry already gives
 * (plan 13, B-17, S-59; B-40, S-184): straight to the models, the test of the connection, and the
 * "Project" section's own cards — opening CLAUDE.md's own card, or a new slash command's or a new
 * subagent's, a folder still to be chosen there, the same way choosing a model or testing the
 * connection never carries one either. Mounted once, by `ShellHosts` through `commandHosts` — the
 * hook needs `useNavigate()` resolved against whichever router is actually on screen (plan 28, B-38,
 * S-111), which a plain, statically-registered command cannot do.
 */
export function ClaudeShortcuts(): null {
  const navigate = useNavigate();

  const declarations: CommandDeclaration[] = [
    {
      id: 'agent.defaultModel',
      formerIds: ['claude.defaultModel'],
      labelKey: 'engines.claude.command.defaultModel',
      category: 'go',
      icon: Sparkles,
      run: () => {
        void navigate({ href: agentSettingsHref({ engine: 'claude', section: 'models' }) });
      },
      keys: [{ key: 'Mod+K M', context: 'global' }],
    },
    {
      id: 'agent.testConnection',
      formerIds: ['claude.testConnection'],
      labelKey: 'engines.claude.command.testConnection',
      category: 'go',
      icon: Gauge,
      run: () => {
        void navigate({ href: agentSettingsHref({ engine: 'claude', section: 'installation' }) });
      },
      keys: [{ key: 'Mod+K T', context: 'global' }],
    },
    {
      id: 'agent.openMemory',
      labelKey: 'engines.claude.command.openMemory',
      category: 'go',
      icon: FileText,
      run: () => {
        void navigate({ href: agentSettingsHref({ engine: 'claude', section: 'project' }) });
      },
      keys: [{ key: 'Mod+K C', context: 'global' }],
    },
    {
      id: 'agent.newCommand',
      labelKey: 'engines.claude.command.newCommand',
      category: 'go',
      icon: SquareSlash,
      run: () => {
        void navigate({ href: agentSettingsHref({ engine: 'claude', section: 'project' }) });
      },
      keys: [{ key: 'Mod+K N', context: 'global' }],
    },
    {
      id: 'agent.newSubagent',
      labelKey: 'engines.claude.command.newSubagent',
      category: 'go',
      icon: Users,
      run: () => {
        void navigate({ href: agentSettingsHref({ engine: 'claude', section: 'project' }) });
      },
      keys: [{ key: 'Mod+K G', context: 'global' }],
    },
  ];

  useCommands(declarations);

  return null;
}
