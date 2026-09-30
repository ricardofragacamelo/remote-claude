import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useCommands } from '@/features/commands';
import type { CommandDeclaration } from '@/features/commands';
import { createCommandRegistry } from '@/features/commands/store/command-registry';

function declaration(extra: Partial<CommandDeclaration> = {}): CommandDeclaration {
  return {
    id: 'test.one',
    labelKey: 'command.palette.show',
    category: 'view',
    run: vi.fn(),
    ...extra,
  };
}

describe('commands registered while mounted', () => {
  it('are there with their keys while mounted, and gone after', () => {
    const registry = createCommandRegistry();
    const { unmount } = renderHook(() => {
      useCommands([declaration({ keys: [{ key: 'Alt+1', context: 'workbench' }] })], registry);
    });

    expect(registry.command('test.one')).toBeDefined();
    expect(registry.bindingOf('test.one')).toMatchObject({ command: 'test.one', key: 'Alt+1' });

    unmount();
    expect(registry.commands()).toEqual([]);
    expect(registry.bindings()).toEqual([]);
  });

  it('run and answer "can run" as the last render declared, without registering again', () => {
    const registry = createCommandRegistry();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ run, able }: { run: () => void; able: boolean }) => {
        useCommands([declaration({ run, when: () => able })], registry);
      },
      { initialProps: { run: first, able: true } },
    );
    const registered = registry.command('test.one');

    rerender({ run: second, able: false });
    void registered?.run();

    expect(registry.command('test.one')).toBe(registered);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(registered?.when?.()).toBe(false);
  });

  it('register again when the label changes', () => {
    const registry = createCommandRegistry();
    const { rerender } = renderHook(
      ({ labelKey }: { labelKey: string }) => {
        useCommands([declaration({ labelKey })], registry);
      },
      { initialProps: { labelKey: 'status.theme.toDark' } },
    );

    rerender({ labelKey: 'status.theme.toLight' });
    expect(registry.command('test.one')?.labelKey).toBe('status.theme.toLight');
    expect(registry.commands()).toHaveLength(1);
  });

  it('keep a command with no condition always able to run', () => {
    const registry = createCommandRegistry();
    renderHook(() => {
      useCommands([declaration()], registry);
    });

    expect(registry.command('test.one')?.when).toBeUndefined();
  });

  it('answer "cannot run" for a command whose declaration was dropped from the list', () => {
    const registry = createCommandRegistry();
    const { rerender } = renderHook(
      ({ list }: { list: CommandDeclaration[] }) => {
        useCommands(list, registry);
      },
      { initialProps: { list: [declaration({ when: () => true })] } },
    );
    const registered = registry.command('test.one');

    rerender({ list: [declaration({ id: 'test.two' })] });
    expect(registered?.when?.()).toBe(false);
  });
});
