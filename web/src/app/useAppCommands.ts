import { CircleHelp, Gauge, Info, Languages, Moon, Sparkles, Sun } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';

import { claudeSettingsHref } from '@/features/claude-settings';
import { useCommands } from '@/features/commands';
import type { CommandDeclaration } from '@/features/commands';
import { useWorkbenchTarget } from '@/features/workbench';
import { useHelpPanel } from '@/shared/hooks/useHelpPanel';
import { useLocale } from '@/shared/hooks/useLocale';
import { useRegistry } from '@/shared/hooks/useRegistry';
import { useTheme } from '@/shared/hooks/useTheme';
import type { Locale } from '@/shared/i18n';
import { globalNavigation } from './global-navigation';

/** "Change the language to …", each in the language it names — named in full. */
const LANGUAGE_COMMANDS: Readonly<Record<Locale, string>> = {
  en: 'command.preferences.languageEn',
  'pt-BR': 'command.preferences.languagePtBR',
};

/**
 * The commands of the app itself, registered while somebody is signed in: go to each screen of the
 * navigation — the ones registered now, so a plan that adds a screen adds its command too — and to
 * About, which lives in the "manage" menu; switch the theme and the language, and open the help of
 * the screen (plan 06, B-23, B-32).
 *
 * The help has a shortcut, `Shift+F1`: `F1` is the palette's, as in the editor people know. It is
 * there only on a screen that has a help — the workbench has none.
 */
export function useAppCommands(): void {
  const navigate = useNavigate();
  const entries = useRegistry(globalNavigation);
  const workbenchFolder = useWorkbenchTarget(true);
  const theme = useTheme((state) => state.theme);

  const declarations: CommandDeclaration[] = [
    ...entries.map((entry): CommandDeclaration => ({
      id: `navigation.${entry.id}`,
      labelKey: entry.labelKey,
      category: 'go',
      icon: entry.icon,
      run: () => {
        void navigate({ href: entry.href({ workbenchFolder }) });
      },
    })),
    {
      id: 'navigation.about',
      labelKey: 'navigation.entry.about',
      category: 'go',
      icon: Info,
      run: () => {
        void navigate({ to: '/about' });
      },
    },
    {
      id: 'preferences.toggleTheme',
      labelKey: theme === 'dark' ? 'status.theme.toLight' : 'status.theme.toDark',
      category: 'preferences',
      icon: theme === 'dark' ? Sun : Moon,
      run: () => {
        useTheme.getState().toggle();
      },
    },
    ...(Object.keys(LANGUAGE_COMMANDS) as Locale[]).map((each): CommandDeclaration => ({
      id: `preferences.language.${each}`,
      labelKey: LANGUAGE_COMMANDS[each],
      category: 'preferences',
      icon: Languages,
      when: () => useLocale.getState().locale !== each,
      run: () => {
        useLocale.getState().setLocale(each);
      },
    })),
    {
      // The defaults of Claude, and the test of the connection: their place is the screen of plan
      // 13, and the palette goes there (plan 13, B-17, S-59; the keys, D-26).
      id: 'claude.defaultModel',
      labelKey: 'command.claude.defaultModel',
      category: 'go',
      icon: Sparkles,
      run: () => {
        void navigate({ href: claudeSettingsHref({ section: 'models' }) });
      },
      keys: [{ key: 'Mod+K M', context: 'global' }],
    },
    {
      id: 'claude.testConnection',
      labelKey: 'command.claude.testConnection',
      category: 'go',
      icon: Gauge,
      run: () => {
        void navigate({ href: claudeSettingsHref({ section: 'installation' }) });
      },
      keys: [{ key: 'Mod+K T', context: 'global' }],
    },
    {
      id: 'help.show',
      labelKey: 'command.help.show',
      category: 'help',
      icon: CircleHelp,
      when: () => useHelpPanel.getState().hosts > 0,
      run: () => {
        useHelpPanel.getState().show();
      },
      keys: [{ key: 'Shift+F1', context: 'global' }],
    },
  ];

  useCommands(declarations);
}
