import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { commandRegistry } from '../store/command-registry';
import type { CommandRegistry } from '../store/command-registry';
import { isKeyContextActive } from '../store/key-contexts';
import { KEY_CONTEXTS } from '../types/command';
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

/** How specific a context is: the later in {@link KEY_CONTEXTS}, the more. */
function specificity(binding: Keybinding): number {
  return KEY_CONTEXTS.indexOf(binding.context);
}

/**
 * The binding a press answers: among the live contexts, the most specific — the workbench's over the
 * global one, the PDF reader's over the workbench's.
 */
export function bindingFor(
  bindings: readonly Keybinding[],
  chord: string,
  mac: boolean,
  isActive: (context: Keybinding['context']) => boolean = isKeyContextActive,
): Keybinding | undefined {
  return bindings
    .filter((binding) => isActive(binding.context) && chordOf(binding, mac) === chord)
    .reduce<Keybinding | undefined>(
      (best, binding) =>
        best === undefined || specificity(binding) > specificity(best) ? binding : best,
      undefined,
    );
}

/** A key that is only a modifier: pressed on its way to a chord, never a chord of its own. */
const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta']);

/**
 * Whether a chord begins a sequence some live binding has — `Ctrl+K` of `Ctrl+K S` — for a press
 * at `target`.
 */
function startsSequence(
  bindings: readonly Keybinding[],
  chord: string,
  mac: boolean,
  target: EventTarget | null,
): boolean {
  return bindings.some(
    (binding) =>
      isKeyContextActive(binding.context) &&
      chordOf(binding, mac).startsWith(`${chord} `) &&
      (!isEditable(target) || binding.allowInInput === true),
  );
}

/**
 * Runs the command a key press is bound to — once, for the whole app.
 *
 * - With the focus in a text field, only a binding that allows it fires: the palette's (S-120).
 * - Inside a dialog, none does.
 * - A command that is not available now does not run, and the key is left to the browser (S-121).
 * - A sequence (`Ctrl+K S`, plan 07) waits for its next chord after the first: that one goes to no
 *   one else, and whatever comes next ends the wait, bound or not — as the editor people know does.
 */
export function useKeybindings(registry: CommandRegistry = commandRegistry): void {
  const { t } = useTranslation();

  useEffect(() => {
    const mac = onMac();
    let pending: string | null = null;

    const run = (event: KeyboardEvent, binding: Keybinding | undefined): void => {
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

    const listen = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        inDialog(event.target) ||
        MODIFIER_KEYS.has(event.key)
      ) {
        return;
      }

      const chord = chordOfEvent(event);
      const sequence = pending === null ? chord : `${pending} ${chord}`;
      const binding = bindingFor(registry.bindings(), sequence, mac);

      if (
        pending === null &&
        binding === undefined &&
        startsSequence(registry.bindings(), chord, mac, event.target)
      ) {
        pending = chord;
        event.preventDefault();
        return;
      }

      pending = null;
      run(event, binding);
    };

    document.addEventListener('keydown', listen);
    return () => {
      document.removeEventListener('keydown', listen);
    };
  }, [registry, t]);
}
