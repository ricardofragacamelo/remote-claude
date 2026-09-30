import { useEffect, useLayoutEffect, useRef } from 'react';

import { commandRegistry } from '../store/command-registry';
import type { CommandRegistry } from '../store/command-registry';
import type { Command, Keybinding } from '../types/command';

/** A command, and the keys that run it. */
export interface CommandDeclaration extends Command {
  readonly keys?: readonly Omit<Keybinding, 'command'>[];
}

/** What decides whether a command has to be registered again: everything but its behaviour. */
function shapeOf(declarations: readonly CommandDeclaration[]): string {
  return JSON.stringify(
    declarations.map(({ id, labelKey, labelParams, category, fileMenu, keys }) => ({
      id,
      labelKey,
      labelParams,
      category,
      fileMenu: fileMenu === undefined ? null : [fileMenu.group, fileMenu.order],
      keys,
    })),
  );
}

/**
 * Registers commands while the component that owns what they act on is mounted — the dialog of
 * "Open folder", the folder tabs — and takes them out when it goes.
 *
 * `when` and `run` are read from the **latest** render, so a command acts on what is on screen now
 * and the registry does not churn on every render; a change of label, shortcut or place in the menu
 * registers it again. The component the File menu opens (`fileMenu.submenu`) is the first one given:
 * declare it once, outside the render.
 *
 * @throws {Error} as {@link CommandRegistry.register} and {@link CommandRegistry.bind} do
 */
export function useCommands(
  declarations: readonly CommandDeclaration[],
  registry: CommandRegistry = commandRegistry,
): void {
  const latest = useRef(declarations);
  const shape = shapeOf(declarations);

  // Before any effect — the one below included — so what runs is what the last render declared.
  useLayoutEffect(() => {
    latest.current = declarations;
  });

  useEffect(() => {
    const current = (id: string): CommandDeclaration | undefined =>
      latest.current.find((declaration) => declaration.id === id);

    const undo = latest.current.flatMap(({ keys = [], when, run, ...fixed }) => {
      const command: Command = {
        ...fixed,
        ...(when === undefined ? {} : { when: () => current(fixed.id)?.when?.() ?? false }),
        run: () => (current(fixed.id)?.run ?? run)(),
      };

      return [
        registry.register(command),
        ...keys.map((key) => registry.bind({ ...key, command: fixed.id })),
      ];
    });

    return () => {
      for (const each of undo) {
        each();
      }
    };
  }, [registry, shape]);
}
