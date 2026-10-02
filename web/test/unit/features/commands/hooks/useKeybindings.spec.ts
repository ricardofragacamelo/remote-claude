import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

import { bindingFor, useKeybindings } from '@/features/commands/hooks/useKeybindings';
import { createCommandRegistry } from '@/features/commands/store/command-registry';
import { enterKeyContext } from '@/features/commands/store/key-contexts';
import type { Command, Keybinding } from '@/features/commands';
import { providers } from '../../../../support/render';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

/** A registry with one command bound to a key, and the shortcuts listened to. */
function listening(key: string, command: Partial<Command> = {}, binding: Partial<Keybinding> = {}) {
  const registry = createCommandRegistry();
  const run = vi.fn();
  registry.register({
    id: 'test.run',
    labelKey: 'command.palette.show',
    category: 'view',
    run,
    ...command,
  });
  registry.bind({ command: 'test.run', key, context: 'global', ...binding });
  const hook = renderHook(
    () => {
      useKeybindings(registry);
    },
    { wrapper: providers() },
  );
  return { registry, run, ...hook };
}

/** Presses a key on an element — the page itself when none — and says whether the page took it. */
function press(init: KeyboardEventInit, target: EventTarget = document.body): boolean {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

function field(tag: 'input' | 'textarea' | 'select' | 'div', type?: string): HTMLElement {
  const element = document.createElement(tag);
  if (type !== undefined) element.setAttribute('type', type);
  if (tag === 'div') element.setAttribute('contenteditable', 'true');
  document.body.append(element);
  return element;
}

describe('a shortcut pressed — plan 06, B-23', () => {
  it('runs its command, and keeps the browser from doing its own thing with the key', () => {
    const { run } = listening('Mod+O');

    expect(press({ key: 'o', code: 'KeyO', ctrlKey: true })).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('does nothing for a key nobody bound', () => {
    const { run } = listening('Mod+O');

    expect(press({ key: 'p', code: 'KeyP', ctrlKey: true })).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it('does not answer a press somebody else already took, nor one in the middle of composing', () => {
    const { run } = listening('Mod+O');
    const taken = new KeyboardEvent('keydown', {
      key: 'o',
      code: 'KeyO',
      ctrlKey: true,
      cancelable: true,
      bubbles: true,
    });
    taken.preventDefault();
    document.body.dispatchEvent(taken);
    press({ key: 'o', code: 'KeyO', ctrlKey: true, isComposing: true });

    expect(run).not.toHaveBeenCalled();
  });

  it('stops listening once unmounted', () => {
    const { run, unmount } = listening('Mod+O');
    unmount();

    press({ key: 'o', code: 'KeyO', ctrlKey: true });
    expect(run).not.toHaveBeenCalled();
  });
});

describe('a shortcut in a text field — plan 06, S-120', () => {
  it.each([
    ['a text input', () => field('input', 'text')],
    ['a textarea', () => field('textarea')],
    ['a select', () => field('select')],
    ['an editable block', () => field('div')],
  ])('does not fire from %s', (_, make) => {
    const { run } = listening('Mod+B');

    expect(press({ key: 'b', code: 'KeyB', ctrlKey: true }, make())).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it('fires from a checkbox, which is not text', () => {
    const { run } = listening('Mod+B');

    press({ key: 'b', code: 'KeyB', ctrlKey: true }, field('input', 'checkbox'));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("fires when the binding allows it — the palette's", () => {
    const { run } = listening('Mod+Shift+P', {}, { allowInInput: true });

    press({ key: 'P', code: 'KeyP', ctrlKey: true, shiftKey: true }, field('textarea'));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('does not fire inside a dialog, not even the palette’s', () => {
    const { run } = listening('Mod+Shift+P', {}, { allowInInput: true });
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const input = document.createElement('input');
    dialog.append(input);
    document.body.append(dialog);

    press({ key: 'P', code: 'KeyP', ctrlKey: true, shiftKey: true }, input);
    expect(run).not.toHaveBeenCalled();
  });
});

describe('a shortcut of a command that cannot run now — plan 06, S-121', () => {
  it('runs nothing, and leaves the key to the browser', () => {
    const { run } = listening('Alt+2', { when: () => false });

    expect(press({ key: '2', code: 'Digit2', altKey: true })).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it('runs nothing for a binding whose command is not registered', () => {
    const registry = createCommandRegistry();
    registry.bind({ command: 'nobody', key: 'Alt+3', context: 'global' });
    renderHook(
      () => {
        useKeybindings(registry);
      },
      { wrapper: providers() },
    );

    expect(press({ key: '3', code: 'Digit3', altKey: true })).toBe(false);
  });
});

describe('which binding a press answers', () => {
  const global: Keybinding = { command: 'a', key: 'Alt+1', context: 'global' };
  const workbench: Keybinding = { command: 'b', key: 'Alt+1', context: 'workbench' };

  it("is the workbench's over the global one while the workbench is on screen", () => {
    expect(bindingFor([global, workbench], 'Alt+1', false, () => true)).toBe(workbench);
  });

  it("is the global one while the workbench's context is not live", () => {
    expect(bindingFor([global, workbench], 'Alt+1', false)).toBe(global);
    const leave = enterKeyContext('workbench');
    expect(bindingFor([global, workbench], 'Alt+1', false)).toBe(workbench);
    leave();
  });

  it('is none for a chord nobody bound', () => {
    expect(bindingFor([global], 'Alt+2', false)).toBeUndefined();
  });
});

describe('a sequence pressed — plan 07, B-34', () => {
  it('runs its command on the second chord, and the first goes to no one else', () => {
    const { run } = listening('Mod+K S');

    expect(press({ key: 'k', code: 'KeyK', ctrlKey: true })).toBe(true);
    expect(run).not.toHaveBeenCalled();
    // The modifier pressed on the way to the next chord does not end the wait.
    expect(press({ key: 'Control', code: 'ControlLeft', ctrlKey: true })).toBe(false);
    expect(press({ key: 's', code: 'KeyS' })).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('ends the wait on any other chord, bound or not, and runs nothing', () => {
    const { run } = listening('Mod+K S');

    press({ key: 'k', code: 'KeyK', ctrlKey: true });
    expect(press({ key: 'x', code: 'KeyX' })).toBe(false);
    expect(press({ key: 's', code: 'KeyS' })).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it('does not begin in a text field unless the binding allows it there', () => {
    const { run } = listening('Mod+K S');
    const input = field('input', 'text');

    expect(press({ key: 'k', code: 'KeyK', ctrlKey: true }, input)).toBe(false);
    expect(press({ key: 's', code: 'KeyS' }, input)).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it('begins and runs in a text field when the binding allows it — the editor’s save all', () => {
    const { run } = listening('Mod+K S', {}, { allowInInput: true });
    const editor = field('textarea');

    expect(press({ key: 'k', code: 'KeyK', ctrlKey: true }, editor)).toBe(true);
    expect(press({ key: 's', code: 'KeyS' }, editor)).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
