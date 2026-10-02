import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchChangeFile,
  fetchChanges,
  fetchToolDiff,
  rejectFiles,
  rejectHunk,
  restoreChange,
} from '@/features/session/services/changes.service';
import { api } from '@/shared/api/api';
import type { WsClient } from '@/shared/api/ws-client';
import { SESSION } from '../../../../support/session-tools';

afterEach(() => {
  vi.restoreAllMocks();
});

const aHunk = (overrides: Record<string, unknown> = {}) => ({
  id: 'h1',
  oldStart: 3,
  newStart: 4,
  lines: [
    { kind: 'removed', text: 'old' },
    { kind: 'added', text: 'new' },
    { kind: 'weird', text: 'dropped' },
    'not a line',
  ],
  ...overrides,
});

describe('what a session changed, as the backend answers it — plan 08, F3', () => {
  it('reads the diff of a tool, with both sides and the hunks — B-25', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({
      path: '/srv/app/a.ts',
      toolName: 'Edit',
      scope: 'file',
      before: { state: 'content', content: 'old\n' },
      after: { state: 'unavailable', reason: 'laterWrite' },
      hunks: [aHunk(), { lines: [] }, 'nonsense'],
    });

    const diff = await fetchToolDiff(SESSION, 'toolu 1');

    expect(get).toHaveBeenCalledWith(`/sessions/${SESSION}/tools/toolu%201/diff`);
    expect(diff).toEqual({
      path: '/srv/app/a.ts',
      toolName: 'Edit',
      scope: 'file',
      before: { state: 'content', content: 'old\n', reason: null },
      after: { state: 'unavailable', content: null, reason: 'laterWrite' },
      hunks: [
        {
          id: 'h1',
          oldStart: 3,
          newStart: 4,
          lines: [
            { kind: 'removed', text: 'old' },
            { kind: 'added', text: 'new' },
          ],
        },
      ],
    });
  });

  it('reads what it cannot trust as an edit with nothing known', async () => {
    vi.spyOn(api, 'get').mockResolvedValue('nonsense');

    expect(await fetchToolDiff(SESSION, 't')).toEqual({
      path: '',
      toolName: '',
      scope: 'edit',
      before: { state: 'unavailable', content: null, reason: null },
      after: { state: 'unavailable', content: null, reason: null },
      hunks: [],
    });
  });

  it('reads the list of changes, and drops a file it cannot read — B-26', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      promptId: 'p1',
      files: [
        {
          path: '/srv/app/a.ts',
          kind: 'modified',
          promptId: 'p1',
          modifiedOutside: true,
          added: 2,
          removed: 1,
          revision: 'r1',
        },
        { path: '/srv/app/b.bin', kind: 'created', promptId: 'p2', added: null, removed: 'x' },
        { path: '/srv/app/c.ts', kind: 'renamed', promptId: 'p1' },
        'nonsense',
      ],
    });

    expect(await fetchChanges(SESSION)).toEqual({
      promptId: 'p1',
      files: [
        {
          path: '/srv/app/a.ts',
          kind: 'modified',
          promptId: 'p1',
          modifiedOutside: true,
          added: 2,
          removed: 1,
          revision: 'r1',
        },
        {
          path: '/srv/app/b.bin',
          kind: 'created',
          promptId: 'p2',
          modifiedOutside: false,
          added: null,
          removed: null,
          revision: '',
        },
      ],
    });
  });

  it('reads an empty answer as no changes', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(undefined);
    expect(await fetchChanges(SESSION)).toEqual({ promptId: null, files: [] });
  });

  it('reads one file of the changes, by its absolute path', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({
      path: '/srv/app/a.ts',
      kind: null,
      promptId: 'p1',
      modifiedOutside: false,
      before: { state: 'content', content: 'a' },
      now: { state: 'absent' },
      revision: 'absent',
      hunks: [aHunk()],
    });

    const file = await fetchChangeFile(SESSION, '/srv/app/a.ts');

    expect(get).toHaveBeenCalledWith(`/sessions/${SESSION}/changes/file?path=%2Fsrv%2Fapp%2Fa.ts`);
    expect(file).toMatchObject({ kind: null, revision: 'absent', now: { state: 'absent' } });
  });

  it('reads a broken file answer with the path it asked for', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(null);
    expect(await fetchChangeFile(SESSION, '/x')).toMatchObject({
      path: '/x',
      promptId: '',
      revision: '',
      hunks: [],
    });
  });
});

describe('rejecting, over the socket — B-30, B-31', () => {
  const client = () => {
    const issue = vi.fn(() => 'cmd-1');
    return { issue, client: { issue } as unknown as WsClient };
  };

  it('rejects files with the paths, or every file without them', () => {
    const { issue, client: ws } = client();

    expect(rejectFiles(ws, SESSION, 'p1', ['/a'])).toBe('cmd-1');
    rejectFiles(ws, SESSION, 'p1');

    expect(issue).toHaveBeenNthCalledWith(1, 'session.rewindFiles', {
      sessionId: SESSION,
      promptId: 'p1',
      paths: ['/a'],
    });
    expect(issue).toHaveBeenNthCalledWith(2, 'session.rewindFiles', {
      sessionId: SESSION,
      promptId: 'p1',
    });
  });

  it('rejects a hunk against its revision, and undoes a rejection', () => {
    const { issue, client: ws } = client();

    rejectHunk(ws, SESSION, { path: '/a', hunkId: 'h1', revision: 'r1' });
    restoreChange(ws, SESSION, '/a');

    expect(issue).toHaveBeenNthCalledWith(1, 'session.rejectChange', {
      sessionId: SESSION,
      path: '/a',
      hunkId: 'h1',
      revision: 'r1',
    });
    expect(issue).toHaveBeenNthCalledWith(2, 'session.restoreChange', {
      sessionId: SESSION,
      path: '/a',
    });
  });
});
