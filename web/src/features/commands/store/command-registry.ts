import { createListeners } from '@/shared/lib/registry';
import { chordOf, reservedIn } from '../hooks/chords';
import type { Command, Keybinding } from '../types/command';

/** The commands and the shortcuts of the app, and who is told when they change. */
export interface CommandRegistry {
  /**
   * Adds a command.
   *
   * @throws {Error} an id already taken — two plans claiming one command is a bug to see at load,
   *   not a silent winner (plan 06, S-119)
   * @returns the way to take it back out
   */
  register(command: Command): () => void;

  /**
   * Binds a key to a command.
   *
   * @throws {Error} a chord already bound in the same context — on either platform — or one the
   *   browser keeps for itself (06 · D-16, S-119)
   * @returns the way to take it back out
   */
  bind(binding: Keybinding): () => void;

  /** Every command, in the order they came. The same array until something changes. */
  commands(): readonly Command[];

  /** Every binding. The same array until something changes. */
  bindings(): readonly Keybinding[];
  command(id: string): Command | undefined;

  /** The first key bound to a command — the one the menu, the palette and the help show. */
  bindingOf(id: string): Keybinding | undefined;
  subscribe(listener: () => void): () => void;
}

/** Whether two bindings would answer the same press in the same context, on some platform. */
function collides(left: Keybinding, right: Keybinding): boolean {
  return (
    left.context === right.context &&
    (chordOf(left, false) === chordOf(right, false) || chordOf(left, true) === chordOf(right, true))
  );
}

/**
 * The registry of commands and shortcuts: registered **once**, shown by the palette, the File menu
 * and the help of a screen with the same label and the same shortcut
 * (docs/architecture/web/03-ui-system.md#comandos-atalhos-e-a-paleta).
 *
 * @param name what to call it in an error
 */
export function createCommandRegistry(name = 'commands'): CommandRegistry {
  let commands: readonly Command[] = [];
  let bindings: readonly Keybinding[] = [];
  const listeners = createListeners();
  const changed = listeners.notify;

  return {
    register(command) {
      if (commands.some((existing) => existing.id === command.id)) {
        throw new Error(`${name}: "${command.id}" is already registered`);
      }

      commands = [...commands, command];
      changed();

      return () => {
        if (commands.includes(command)) {
          commands = commands.filter((existing) => existing !== command);
          changed();
        }
      };
    },

    bind(binding) {
      const reserved = reservedIn(binding);

      if (reserved !== null) {
        throw new Error(
          `${name}: "${binding.key}" of "${binding.command}" is kept by the browser (${reserved})`,
        );
      }

      const taken = bindings.find((existing) => collides(existing, binding));

      if (taken !== undefined) {
        throw new Error(
          `${name}: "${binding.key}" of "${binding.command}" is already bound to "${taken.command}" in ${binding.context}`,
        );
      }

      bindings = [...bindings, binding];
      changed();

      return () => {
        if (bindings.includes(binding)) {
          bindings = bindings.filter((existing) => existing !== binding);
          changed();
        }
      };
    },

    commands: () => commands,
    bindings: () => bindings,
    command: (id) => commands.find((command) => command.id === id),
    bindingOf: (id) => bindings.find((binding) => binding.command === id),
    subscribe: listeners.subscribe,
  };
}

/** The commands of the app. */
export const commandRegistry = createCommandRegistry();
