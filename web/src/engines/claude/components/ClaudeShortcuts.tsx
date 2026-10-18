import { Gauge, Sparkles } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';

import { agentSettingsHref } from '@/features/agent-settings';
import { useCommands } from '@/features/commands';
import type { CommandDeclaration } from '@/features/commands';

/**
 * Two shortcuts beyond the generic "go to the engine's settings" the navigation entry already gives
 * (plan 13, B-17, S-59): straight to the models and the test of the connection. Mounted once, by
 * `ShellHosts` through `commandHosts` — the hook needs `useNavigate()` resolved against whichever
 * router is actually on screen (plan 28, B-38, S-111), which a plain, statically-registered command
 * cannot do.
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
  ];

  useCommands(declarations);

  return null;
}
