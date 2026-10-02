import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';

import { useInlineName } from '@/features/explorer/hooks/useInlineName';
import type { OperationRunner } from '@/features/explorer/hooks/useOutcome';
import { explorerStore, forgetExplorer } from '@/features/explorer/store/explorer.store';
import { resetEditorFake } from '../../../../support/editor-fake';
import { FakeFolder } from '../../../../support/files-api';

vi.mock(
  '@/features/editor',
  async () => (await import('../../../../support/editor-fake')).editorFake,
);

const APP = '/srv/app';

afterEach(() => {
  vi.restoreAllMocks();
  resetEditorFake();
  forgetExplorer(null);
});

function aRunner(): OperationRunner {
  return {
    outcome: null,
    sensitive: null,
    busy: false,
    run: vi.fn(() => Promise.resolve()),
    show: vi.fn(),
    closeOutcome: vi.fn(),
    askSensitive: vi.fn(),
    confirmSensitive: vi.fn(() => Promise.resolve()),
    cancelSensitive: vi.fn(),
  };
}

function inline() {
  const disk = new FakeFolder(APP, { 'a.ts': 'a' }).install();
  const context = { folder: APP, client: new QueryClient() };
  const { result } = renderHook(() => useInlineName(context, aRunner()));
  return { disk, result };
}

describe('a name typed in place, with nothing being named', () => {
  it('has no problem, and sending it just ends the editing', async () => {
    const { disk, result } = inline();

    expect(result.current.problemOf('')).toBeNull();
    await act(async () => {
      expect(await result.current.submit('x.ts')).toEqual({ kind: 'done' });
    });
    expect(disk.calls).toEqual([]);
  });

  it('sends once while a name is on its way', async () => {
    const { disk, result } = inline();
    const release = disk.hold((call) => call.route === '/files');
    explorerStore(APP).getState().startCreating({
      parent: '',
      kind: 'file',
      initialName: '',
      template: null,
      source: null,
    });

    let first: Promise<unknown> = Promise.resolve();
    let second: unknown;
    await act(async () => {
      first = result.current.submit('n.ts');
      second = await result.current.submit('n.ts');
    });
    release();
    await act(async () => {
      await first;
    });

    expect(second).toEqual({ kind: 'asked' });
    expect(disk.callsTo('POST', '/files')).toHaveLength(1);
  });
});
