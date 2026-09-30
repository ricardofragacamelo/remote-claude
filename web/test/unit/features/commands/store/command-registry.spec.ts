import { describe, expect, it, vi } from 'vitest';

import { createCommandRegistry } from '@/features/commands/store/command-registry';
import type { Command, Keybinding } from '@/features/commands';

function aCommand(id: string, extra: Partial<Command> = {}): Command {
  return { id, labelKey: 'command.palette.show', category: 'view', run: vi.fn(), ...extra };
}

function aBinding(command: string, key: string, extra: Partial<Keybinding> = {}): Keybinding {
  return { command, key, context: 'global', ...extra };
}

describe('the registry of commands — plan 06, S-119', () => {
  it('refuses a second command with an id already taken, saying which', () => {
    const registry = createCommandRegistry('commands');
    registry.register(aCommand('workspace.openFolder'));

    expect(() => registry.register(aCommand('workspace.openFolder'))).toThrow(
      'commands: "workspace.openFolder" is already registered',
    );
  });

  it('lists what was registered, in order, and the same list until something changes', () => {
    const registry = createCommandRegistry();
    registry.register(aCommand('a'));
    registry.register(aCommand('b'));

    expect(registry.commands().map((each) => each.id)).toEqual(['a', 'b']);
    expect(registry.commands()).toBe(registry.commands());
    expect(registry.command('b')?.id).toBe('b');
    expect(registry.command('c')).toBeUndefined();
  });

  it('takes a command back out once, and tells whoever listens each time it changes', () => {
    const registry = createCommandRegistry();
    const listener = vi.fn();
    const stop = registry.subscribe(listener);
    const remove = registry.register(aCommand('a'));

    remove();
    remove();

    expect(registry.commands()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    registry.register(aCommand('a'));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('the registry of shortcuts — plan 06, S-119, D-16', () => {
  it('refuses a chord already bound in the same context, naming who has it', () => {
    const registry = createCommandRegistry('commands');
    registry.bind(aBinding('palette.show', 'Mod+Shift+P'));

    expect(() => registry.bind(aBinding('other', 'Ctrl+Shift+P'))).toThrow(
      'commands: "Ctrl+Shift+P" of "other" is already bound to "palette.show" in global',
    );
  });

  it('refuses a chord that only collides on a Mac', () => {
    const registry = createCommandRegistry();
    registry.bind(aBinding('next', 'Ctrl+Alt+PageDown', { mac: 'Mod+Alt+ArrowRight' }));

    expect(() => registry.bind(aBinding('other', 'Alt+X', { mac: 'Mod+Alt+ArrowRight' }))).toThrow(
      'already bound',
    );
  });

  it('lets the same chord live in two contexts', () => {
    const registry = createCommandRegistry();
    registry.bind(aBinding('a', 'Alt+1'));
    registry.bind(aBinding('b', 'Alt+1', { context: 'workbench' }));

    expect(registry.bindings()).toHaveLength(2);
  });

  it.each(['Ctrl+Tab', 'Ctrl+W', 'Mod+T', 'Mod+N', 'Ctrl+PageDown'])(
    'refuses a default shortcut on %s, which the browser keeps',
    (key) => {
      const registry = createCommandRegistry('commands');

      expect(() => registry.bind(aBinding('x', key))).toThrow('is kept by the browser');
    },
  );

  it('answers the first key bound to a command, and none once it is taken out', () => {
    const registry = createCommandRegistry();
    const first = registry.bind(aBinding('palette.show', 'Mod+Shift+P'));
    registry.bind(aBinding('palette.show', 'F1'));

    expect(registry.bindingOf('palette.show')?.key).toBe('Mod+Shift+P');
    first();
    first();
    expect(registry.bindingOf('palette.show')?.key).toBe('F1');
    expect(registry.bindingOf('nothing')).toBeUndefined();
  });
});
