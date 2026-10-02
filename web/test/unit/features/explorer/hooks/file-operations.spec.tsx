import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

import { copyInto, isTaken, undoLast } from '@/features/explorer/hooks/file-operations';
import { explorerKeys } from '@/features/explorer/hooks/explorer-keys';
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

function contextOver(tree: Record<string, string | { kind: 'directory' }>) {
  const disk = new FakeFolder(APP, tree).install();
  const client = new QueryClient();
  return { disk, client, context: { folder: APP, client } };
}

describe('the operations on files, where the screen does not reach', () => {
  it('undoes nothing when nothing was done', async () => {
    const { disk, context } = contextOver({ 'a.ts': 'a' });

    expect(await undoLast(context)).toBeNull();
    expect(disk.calls).toEqual([]);
  });

  it('copies into a folder not read yet under the name it has', async () => {
    const { disk, context } = contextOver({ 'a.ts': 'a', lib: { kind: 'directory' } });

    const results = await copyInto(context, ['a.ts'], () => 'lib');

    expect(results).toEqual([{ path: 'a.ts', ok: true }]);
    expect(disk.entries.has('lib/a.ts')).toBe(true);
    expect(explorerStore(APP).getState().selection).toEqual(['lib/a.ts']);
  });

  it('refuses to copy a folder into itself, before any request — S-177', async () => {
    const { disk, context } = contextOver({ 'src/a.ts': 'a' });

    await expect(copyInto(context, ['src'], () => 'src/deep')).rejects.toMatchObject({
      code: 'FILE_OPERATION_INVALID',
      params: { path: 'src', reason: 'intoItself' },
    });
    expect(disk.calls).toEqual([]);
  });

  it('answers whether a name is taken from what the cache read', () => {
    const { client, context } = contextOver({});
    client.setQueryData(explorerKeys.directory(APP, 'src'), {
      path: 'src',
      entries: [{ name: 'a.ts' }],
      truncated: false,
    });

    expect(isTaken(context, 'src', 'a.ts')).toBe(true);
    expect(isTaken(context, 'src', 'b.ts')).toBe(false);
    expect(isTaken(context, 'unread', 'a.ts')).toBe(false);
  });
});
