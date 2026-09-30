import { useMemo, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import type { ScreenShortcut } from '@/shared/components/HelpPanel';
import { commandRegistry } from '../store/command-registry';
import type { CommandRegistry } from '../store/command-registry';
import type { Command, ShortcutLabel } from '../types/command';
import { onMac, shortcutLabel } from './chords';
import { commandLabel } from './command-label';

/** The commands, re-read whenever one comes or goes. */
export function useRegisteredCommands(
  registry: CommandRegistry = commandRegistry,
): readonly Command[] {
  return useSyncExternalStore(registry.subscribe, registry.commands);
}

/** The shortcut of every command that has one, by command, for this platform. */
export function useShortcutLabels(
  registry: CommandRegistry = commandRegistry,
): ReadonlyMap<string, ShortcutLabel> {
  const bindings = useSyncExternalStore(registry.subscribe, registry.bindings);

  return useMemo(() => {
    const mac = onMac();
    const labels = new Map<string, ShortcutLabel>();

    for (const binding of bindings) {
      if (!labels.has(binding.command)) {
        labels.set(binding.command, shortcutLabel(binding, mac));
      }
    }

    return labels;
  }, [bindings]);
}

/** How a command's shortcut is written — `null` while it has none, or is not registered. */
export function useShortcut(
  commandId: string,
  registry: CommandRegistry = commandRegistry,
): ShortcutLabel | null {
  return useShortcutLabels(registry).get(commandId) ?? null;
}

/**
 * The shortcuts of a screen, for its help to list — read from the registry, never written again by
 * hand (docs/architecture/web/03-ui-system.md#moldura-de-tela). A command with no shortcut, or not
 * registered, is left out.
 */
export function useScreenShortcuts(
  commandIds: readonly string[],
  registry: CommandRegistry = commandRegistry,
): readonly ScreenShortcut[] {
  const { t } = useTranslation();
  const shortcuts = useShortcutLabels(registry);
  const commands = useRegisteredCommands(registry);

  return commandIds.flatMap((id) => {
    const shortcut = shortcuts.get(id);
    const command = commands.find((each) => each.id === id);

    return shortcut === undefined || command === undefined
      ? []
      : [{ keys: shortcut.label, description: commandLabel(command, t) }];
  });
}
