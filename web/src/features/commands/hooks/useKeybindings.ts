import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { commandRegistry } from '../store/command-registry';
import type { CommandRegistry } from '../store/command-registry';
import { isKeyContextActive } from '../store/key-contexts';
import type { Keybinding } from '../types/command';
import { chordOf, chordOfEvent, onMac } from './chords';
import { executeCommand } from './execute-command';

/** Where typing is text: a shortcut of the shell there would take keys from what is being written. */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  // By the attribute, which also covers an element inside the editable block.
  return (
    target.closest('[contenteditable]:not([contenteditable="false"])') !== null ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLInputElement &&
      !['button', 'checkbox', 'radio', 'submit', 'reset'].includes(target.type))
  );
}

/**
 * Whether the press happened inside a dialog. A dialog holds the focus on purpose — the question
 * of closing a tab, the palette itself — and the shell behind it is not what the keys are for.
 */
function inDialog(target: EventTarget | null): boolean {
  return (
    target instanceof Element && target.closest('[role="dialog"], [role="alertdialog"]') !== null
  );
}

/**
 * The binding a press answers: among the live contexts, the more specific first — the workbench's
 * over the global one.
 */
export function bindingFor(
  bindings: readonly Keybinding[],
  chord: string,
  mac: boolean,
  isActive: (context: Keybinding['context']) => boolean = isKeyContextActive,
): Keybinding | undefined {
  const matching = bindings.filter(
    (binding) => isActive(binding.context) && chordOf(binding, mac) === chord,
  );

  return matching.find((binding) => binding.context !== 'global') ?? matching[0];
}

/**
 * Runs the command a key press is bound to — once, for the whole app.
 *
 * - With the focus in a text field, only a binding that allows it fires: the palette's (S-120).
 * - Inside a dialog, none does.
 * - A command that is not available now does not run, and the key is left to the browser (S-121).
 */
export function useKeybindings(registry: CommandRegistry = commandRegistry): void {
  const { t } = useTranslation();

  useEffect(() => {
    const mac = onMac();

    const listen = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing || inDialog(event.target)) {
        return;
      }

      const binding = bindingFor(registry.bindings(), chordOfEvent(event), mac);

      if (binding === undefined || (isEditable(event.target) && binding.allowInInput !== true)) {
        return;
      }

      const command = registry.command(binding.command);

      if (command === undefined || command.when?.() === false) {
        return;
      }

      event.preventDefault();
      void executeCommand(binding.command, t, registry);
    };

    document.addEventListener('keydown', listen);
    return () => {
      document.removeEventListener('keydown', listen);
    };
  }, [registry, t]);
}
