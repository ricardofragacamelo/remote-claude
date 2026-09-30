import { afterEach, describe, expect, it, vi } from 'vitest';

import { afterClose, executeCommand } from '@/features/commands/hooks/execute-command';
import { createCommandRegistry } from '@/features/commands/store/command-registry';
import type { Command } from '@/features/commands';
import { AppError } from '@/shared/api/errors';
import { onNotify } from '@/shared/lib/notify';
import type { Notification } from '@/shared/lib/notify';
import { createI18n } from '@/shared/i18n';

const t = createI18n('en').t;

afterEach(() => {
  vi.useRealTimers();
});

function withCommand(extra: Partial<Command>) {
  const registry = createCommandRegistry();
  registry.register({
    id: 'workspace.openFolder',
    labelKey: 'command.workspace.openFolder',
    category: 'file',
    run: vi.fn(),
    ...extra,
  });
  const told: Notification[] = [];
  const stop = onNotify((notification) => told.push(notification));
  return { registry, told, stop };
}

describe('running a command', () => {
  it('runs it, and says it did', async () => {
    const run = vi.fn();
    const { registry, told, stop } = withCommand({ run });

    await expect(executeCommand('workspace.openFolder', t, registry)).resolves.toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(told).toEqual([]);
    stop();
  });

  it('runs nothing that is not registered, or cannot run now', async () => {
    const run = vi.fn();
    const { registry, stop } = withCommand({ run, when: () => false });

    await expect(executeCommand('nobody', t, registry)).resolves.toBe(false);
    await expect(executeCommand('workspace.openFolder', t, registry)).resolves.toBe(false);
    expect(run).not.toHaveBeenCalled();
    stop();
  });
});

describe('a command that fails — plan 06, S-126', () => {
  it('becomes a translated notification with the label and the code, and nothing is thrown', async () => {
    const { registry, told, stop } = withCommand({
      run: () => Promise.reject(new AppError('NETWORK_UNREACHABLE', 'common.error.offline', 't-1')),
    });

    await expect(executeCommand('workspace.openFolder', t, registry)).resolves.toBe(false);
    expect(told).toEqual([
      {
        severity: 'error',
        messageKey: 'notification.command.failed',
        params: { command: 'Open folder…', code: 'NETWORK_UNREACHABLE' },
      },
    ]);
    stop();
  });

  it('reports a failure nobody named as an internal error', async () => {
    const { registry, told, stop } = withCommand({
      run: () => {
        throw new Error('boom');
      },
    });

    await executeCommand('workspace.openFolder', t, registry);
    expect(told[0]?.params).toEqual({ command: 'Open folder…', code: 'INTERNAL_ERROR' });
    stop();
  });
});

describe('after the menu or the palette closes', () => {
  it('runs the action on the next turn, not now', () => {
    vi.useFakeTimers();
    const action = vi.fn();

    afterClose(action);
    expect(action).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(action).toHaveBeenCalledTimes(1);
  });
});
