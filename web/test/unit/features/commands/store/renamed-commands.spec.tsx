import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTranslation } from 'react-i18next';

import { executeCommand } from '@/features/commands/hooks/execute-command';
import { useKeybindings } from '@/features/commands/hooks/useKeybindings';
import { useScreenShortcuts, useShortcut } from '@/features/commands/hooks/useShortcut';
import {
  commandIn,
  createCommandRegistry,
  currentIdIn,
} from '@/features/commands/store/command-registry';
import type { Command } from '@/features/commands';
import { providers } from '../../../../support/render';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

/** The panel's prompt box command, renamed by plan 28 (B-39) from the id it had before. */
const FOCUS: Command = {
  id: 'agent.focusComposer',
  formerIds: ['claude.focusComposer'],
  labelKey: 'command.agent.focusComposer',
  category: 'go',
  run: () => undefined,
};

/** A registry with the renamed command, and a shortcut a person kept under its former id. */
function keptUnderTheFormerId(run = vi.fn()) {
  const registry = createCommandRegistry();
  registry.register({ ...FOCUS, run });
  registry.bind({ command: 'claude.focusComposer', key: 'Mod+Alt+L', context: 'global' });
  return { registry, run };
}

describe('a command renamed, and the shortcut kept for its former id — plan 28, S-112', () => {
  it('is found by the id it has now, and by the one it had before', () => {
    const { registry } = keptUnderTheFormerId();

    expect(registry.command('agent.focusComposer')?.id).toBe('agent.focusComposer');
    expect(registry.command('claude.focusComposer')?.id).toBe('agent.focusComposer');
    expect(registry.currentId('claude.focusComposer')).toBe('agent.focusComposer');
  });

  it('leaves an id that names no renamed command as it is', () => {
    const { registry } = keptUnderTheFormerId();

    expect(registry.command('claude.testConnection')).toBeUndefined();
    expect(registry.currentId('claude.testConnection')).toBe('claude.testConnection');
    expect(currentIdIn([], 'workspace.openFolder')).toBe('workspace.openFolder');
  });

  it('prefers a command that has the id as its own over one that had it before', () => {
    const owner: Command = { ...FOCUS, id: 'claude.focusComposer', formerIds: [] };

    expect(commandIn([FOCUS, owner], 'claude.focusComposer')).toBe(owner);
  });

  it('answers the binding kept under the former id as the command’s own', () => {
    const { registry } = keptUnderTheFormerId();

    expect(registry.bindingOf('agent.focusComposer')?.key).toBe('Mod+Alt+L');
    expect(registry.bindingOf('agent.interrupt')).toBeUndefined();
  });

  it('runs the renamed command when the kept shortcut is pressed', () => {
    const { registry, run } = keptUnderTheFormerId();
    renderHook(
      () => {
        useKeybindings(registry);
      },
      { wrapper: providers() },
    );

    document.body.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'l',
        code: 'KeyL',
        ctrlKey: true,
        altKey: true,
      }),
    );

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('runs it by its former id too, as a link or a palette of an older build names it', async () => {
    const { registry, run } = keptUnderTheFormerId();
    const { result } = renderHook(() => useTranslation(), { wrapper: providers() });

    await expect(executeCommand('claude.focusComposer', result.current.t, registry)).resolves.toBe(
      true,
    );
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('shows the kept shortcut under the id the command has now, in the menu and in the help', () => {
    const { registry } = keptUnderTheFormerId();
    const { result } = renderHook(
      () => ({
        label: useShortcut('agent.focusComposer', registry),
        help: useScreenShortcuts(['agent.focusComposer'], registry),
      }),
      { wrapper: providers() },
    );

    expect(result.current.label?.label).toMatch(/L$/);
    expect(result.current.help).toHaveLength(1);
  });

  it('reads a shortcut bound before the command was registered once the command comes', () => {
    const registry = createCommandRegistry();
    registry.bind({ command: 'claude.focusComposer', key: 'Mod+Alt+L', context: 'global' });
    const { result, rerender } = renderHook(() => useShortcut('agent.focusComposer', registry), {
      wrapper: providers(),
    });
    expect(result.current).toBeNull();

    registry.register(FOCUS);
    rerender();

    expect(result.current?.label).toMatch(/L$/);
  });
});
