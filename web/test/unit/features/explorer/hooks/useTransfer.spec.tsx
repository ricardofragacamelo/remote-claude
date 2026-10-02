import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';

import { useTransfer } from '@/features/explorer/hooks/useTransfer';
import type { OperationRunner } from '@/features/explorer/hooks/useOutcome';
import type { EntryRow } from '@/features/explorer/lib/tree-rows';
import { forgetExplorer } from '@/features/explorer/store/explorer.store';
import { api } from '@/shared/api/api';
import { FakeFolder } from '../../../../support/files-api';
import { providers } from '../../../../support/render';
import { fakeTransfer } from '../../../../support/transfer-api';

vi.mock(
  '@/features/editor',
  async () => (await import('../../../../support/editor-fake')).editorFake,
);

const APP = '/srv/app';

afterEach(() => {
  vi.restoreAllMocks();
  forgetExplorer(null);
});

function aRunner(): OperationRunner {
  return {
    outcome: null,
    sensitive: null,
    busy: false,
    run: vi.fn(),
    show: vi.fn(),
    closeOutcome: vi.fn(),
    askSensitive: vi.fn(),
    confirmSensitive: vi.fn(),
    cancelSensitive: vi.fn(),
  };
}

function aRow(path: string, options: { expandable?: boolean; outside?: boolean } = {}): EntryRow {
  const name = path.slice(path.lastIndexOf('/') + 1);

  return {
    type: 'entry',
    key: path,
    path,
    head: path,
    entry: {
      name,
      path,
      kind: options.expandable === true ? 'directory' : 'file',
      size: 1,
      mtime: '2026-10-01T00:00:00.000Z',
      hidden: false,
      unreadableName: false,
      outside: options.outside ?? false,
      targetKind: null,
    },
    names: [name],
    parent: '',
    level: 1,
    setSize: 1,
    posInSet: 1,
    expandable: options.expandable ?? false,
    expanded: false,
    renaming: false,
  };
}

function setUp() {
  const disk = new FakeFolder(APP, { 'a.ts': 'a' }).install();
  const transfer = fakeTransfer(disk);
  const runner = aRunner();
  const hook = renderHook(() => useTransfer({ folder: APP, client: new QueryClient() }, runner), {
    wrapper: providers(),
  });
  return { disk, transfer, runner, hook };
}

describe('the transfer of a folder tab, where the screen does not reach', () => {
  it('does nothing for no files, nothing to download, nothing to send or cancel', async () => {
    const { transfer, hook, runner } = setUp();

    await act(async () => {
      await hook.result.current.start('', []);
      await hook.result.current.download([]);
      await hook.result.current.download([aRow('out', { outside: true })]);
    });
    act(() => {
      hook.result.current.send();
      hook.result.current.cancel();
      hook.result.current.choose('a.ts', 'replace');
      hook.result.current.pickers.picked(null);
      hook.result.current.pick('', 'files');
    });

    expect(transfer.preflights).toHaveLength(0);
    expect(transfer.downloads).toHaveLength(0);
    expect(hook.result.current.upload).toEqual({ step: 'idle' });
    expect(runner.show).not.toHaveBeenCalled();
  });

  it('runs one upload at a time, and one download at a time', async () => {
    const { transfer, hook } = setUp();
    const file = new File(['x'], 'a.ts');
    vi.spyOn(api, 'bytes').mockImplementation(() => new Promise(() => undefined));

    await act(async () => {
      void hook.result.current.start('', [{ file, path: 'a.ts' }]);
      await hook.result.current.start('', [{ file, path: 'b.ts' }]);
    });
    expect(transfer.preflights).toHaveLength(1);
    expect(hook.result.current.upload.step).toBe('conflicts');

    act(() => {
      void hook.result.current.download([aRow('a.ts')]);
    });
    await act(async () => {
      await hook.result.current.download([aRow('a.ts')]);
    });
    expect(api.bytes).toHaveBeenCalledTimes(1);
    expect(hook.result.current.downloading).toBe(true);
  });
});
