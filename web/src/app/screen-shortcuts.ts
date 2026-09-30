import { useTranslation } from 'react-i18next';

import { useScreenShortcuts } from '@/features/commands';
import type { ScreenShortcut } from '@/shared/components/HelpPanel';

/** The shortcuts every screen with a frame has: the palette, and its own help. */
const SHELL = ['palette.show', 'help.show'] as const;

/**
 * The shortcuts a screen's help lists: the shell's, and the screen's own — read from the registry,
 * so the help never says a shortcut the app does not have (docs/architecture/web/03-ui-system.md#moldura-de-tela).
 */
export function useShellShortcuts(own: readonly string[] = []): readonly ScreenShortcut[] {
  return useScreenShortcuts([...own, ...SHELL]);
}

/** What the frame of a screen shows besides its body: its name, its purpose, its shortcuts. */
export interface FramedScreen {
  readonly title: string;
  readonly purpose: string;
  readonly shortcuts: readonly ScreenShortcut[];
}

/**
 * The frame of a screen that is only its body — Devices, Logs and diagnostics, About: the name and
 * the purpose translated from their keys, and the shell's shortcuts.
 *
 * @param titleKey a translation key, named in full where the screen is declared
 * @param purposeKey a translation key, named in full where the screen is declared
 */
export function useFramedScreen(titleKey: string, purposeKey: string): FramedScreen {
  const { t } = useTranslation();
  const shortcuts = useShellShortcuts();

  return { title: t(titleKey), purpose: t(purposeKey), shortcuts };
}
