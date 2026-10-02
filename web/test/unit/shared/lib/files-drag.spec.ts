import { describe, expect, it, vi } from 'vitest';

import {
  addToClaudeContext,
  claudeContextTargets,
  FILES_DRAG_TYPE,
  filesDragPayload,
  plainPaths,
  readFilesDrag,
  scopeDragPayload,
  writeFilesDrag,
} from '@/shared/lib/files-drag';
import type { FilesDragPayload } from '@/shared/lib/files-drag';
import { createRegistry } from '@/shared/lib/registry';

/** A `DataTransfer` that keeps what it was given. */
function aTransfer(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));

  return {
    setData: (format: string, value: string) => data.set(format, value),
    getData: (format: string) => data.get(format) ?? '',
    data,
  };
}

const range = { startLine: 2, startColumn: 1, endLine: 4, endColumn: 9 };

describe('the payload of a drag of files — 07 · B-42, D-20', () => {
  it('S-269 — carries the typed payload and, as a fallback, the relative path as text', () => {
    const { payload } = filesDragPayload('/r/app', [{ path: 'src/a.ts', kind: 'file' }]);
    const transfer = aTransfer();

    writeFilesDrag(transfer, payload as FilesDragPayload);

    expect(JSON.parse(transfer.getData(FILES_DRAG_TYPE))).toEqual({
      folder: '/r/app',
      entries: [{ path: 'src/a.ts', kind: 'file' }],
    });
    expect(transfer.getData('text/plain')).toBe('src/a.ts');
  });

  it('S-270 — keeps every entry, in the order given', () => {
    const { payload } = filesDragPayload('/r/app', [
      { path: 'b.ts', kind: 'file' },
      { path: 'a', kind: 'directory' },
    ]);

    expect(payload?.entries.map((entry) => entry.path)).toEqual(['b.ts', 'a']);
    expect(plainPaths(payload as FilesDragPayload)).toBe('b.ts\na');
  });

  it('S-271 — a directory goes as itself, never expanded', () => {
    const { payload } = filesDragPayload('/r/app', [{ path: 'node_modules', kind: 'directory' }]);

    expect(payload?.entries).toEqual([{ path: 'node_modules', kind: 'directory' }]);
  });

  it('S-274 — leaves out what cannot be acted on, and says why', () => {
    const built = filesDragPayload('/r/app', [
      { path: 'ok.ts', kind: 'file' },
      { path: 'bad�', kind: 'file', inoperable: 'unreadableName' },
      { path: 'out', kind: 'directory', inoperable: 'outsideLink' },
    ]);

    expect(built.payload?.entries).toEqual([{ path: 'ok.ts', kind: 'file' }]);
    expect(built.excluded).toEqual([
      { path: 'bad�', reason: 'unreadableName' },
      { path: 'out', reason: 'outsideLink' },
    ]);
  });

  it('carries nothing when nothing could go', () => {
    const built = filesDragPayload('/r/app', [
      { path: 'out', kind: 'directory', inoperable: 'outsideLink' },
    ]);

    expect(built.payload).toBeNull();
  });

  it('carries a selection of the editor with its range, and its file as text', () => {
    const { payload } = filesDragPayload('/r/app', [], { path: 'src/a.ts', range });

    expect(payload).toEqual({
      folder: '/r/app',
      entries: [],
      selection: { path: 'src/a.ts', range },
    });
    expect(plainPaths(payload as FilesDragPayload)).toBe('src/a.ts');
  });

  it('does not repeat the file of a selection that is also an entry', () => {
    const { payload } = filesDragPayload('/r/app', [{ path: 'a.ts', kind: 'file' }], {
      path: 'a.ts',
      range,
    });

    expect(plainPaths(payload as FilesDragPayload)).toBe('a.ts');
  });

  it('S-278 — the same action gives the same payload every time', () => {
    const candidates = [{ path: 'a.ts', kind: 'file' as const }];

    expect(filesDragPayload('/r/app', candidates)).toEqual(filesDragPayload('/r/app', candidates));
  });
});

describe('reading a drop back', () => {
  it('reads what a drag wrote', () => {
    const transfer = aTransfer();
    const payload: FilesDragPayload = {
      folder: '/r/app',
      entries: [{ path: 'a.ts', kind: 'file' }],
      selection: { path: 'a.ts', range },
    };

    writeFilesDrag(transfer, payload);

    expect(readFilesDrag(transfer)).toEqual(payload);
  });

  it.each([
    ['nothing', {}],
    ['text that is not json', { [FILES_DRAG_TYPE]: '{' }],
    ['a list', { [FILES_DRAG_TYPE]: '[]' }],
    ['no folder', { [FILES_DRAG_TYPE]: JSON.stringify({ entries: [] }) }],
    [
      'entries that are not a list',
      { [FILES_DRAG_TYPE]: JSON.stringify({ folder: '/r', entries: 1 }) },
    ],
    [
      'an entry of an unknown kind',
      {
        [FILES_DRAG_TYPE]: JSON.stringify({ folder: '/r', entries: [{ path: 'a', kind: 'link' }] }),
      },
    ],
    [
      'a selection without a range',
      {
        [FILES_DRAG_TYPE]: JSON.stringify({ folder: '/r', entries: [], selection: { path: 'a' } }),
      },
    ],
    [
      'a range that starts at zero',
      {
        [FILES_DRAG_TYPE]: JSON.stringify({
          folder: '/r',
          entries: [],
          selection: { path: 'a', range: { ...range, startLine: 0 } },
        }),
      },
    ],
  ])('refuses %s', (_label, data) => {
    expect(readFilesDrag(aTransfer(data))).toBeNull();
  });
});

describe('scopeDragPayload — S-273', () => {
  const fromPkg: FilesDragPayload = {
    folder: '/r/app/pkg',
    entries: [{ path: 'src/a.ts', kind: 'file' }],
  };

  it('re-scopes to a target folder that contains the paths', () => {
    expect(scopeDragPayload(fromPkg, '/r/app')).toEqual({
      payload: { folder: '/r/app', entries: [{ path: 'pkg/src/a.ts', kind: 'file' }] },
      refused: [],
    });
  });

  it('refuses what the target folder does not contain', () => {
    const fromApp: FilesDragPayload = {
      folder: '/r/app',
      entries: [
        { path: 'pkg/src/a.ts', kind: 'file' },
        { path: 'README.md', kind: 'file' },
      ],
    };

    expect(scopeDragPayload(fromApp, '/r/app/pkg/')).toEqual({
      payload: { folder: '/r/app/pkg', entries: [{ path: 'src/a.ts', kind: 'file' }] },
      refused: [{ path: 'README.md', reason: 'outsideFolder' }],
    });
  });

  it('refuses the whole of it when nothing is inside', () => {
    const scoped = scopeDragPayload(fromPkg, '/r/other');

    expect(scoped.payload).toBeNull();
    expect(scoped.refused).toEqual([{ path: 'src/a.ts', reason: 'outsideFolder' }]);
  });

  it('never takes a sibling that only shares the prefix', () => {
    const scoped = scopeDragPayload(
      { folder: '/r', entries: [{ path: 'app2/x', kind: 'file' }] },
      '/r/app',
    );

    expect(scoped.payload).toBeNull();
  });

  it('keeps the same folder as it is, and the folder itself as the empty path', () => {
    const scoped = scopeDragPayload(
      { folder: '/r/app', entries: [{ path: '.', kind: 'directory' }] },
      '/r/app',
    );

    expect(scoped.payload?.entries).toEqual([{ path: '', kind: 'directory' }]);
  });

  it('works from and to the root of the disk', () => {
    expect(
      scopeDragPayload({ folder: '/', entries: [{ path: 'r/a.ts', kind: 'file' }] }, '/r').payload,
    ).toEqual({ folder: '/r', entries: [{ path: 'a.ts', kind: 'file' }] });
    expect(
      scopeDragPayload({ folder: '/r', entries: [{ path: './a.ts', kind: 'file' }] }, '/').payload,
    ).toEqual({ folder: '/', entries: [{ path: 'r/a.ts', kind: 'file' }] });
  });

  it('re-scopes the selection with its range, and refuses it when it is outside', () => {
    const withSelection: FilesDragPayload = {
      folder: '/r/app/pkg',
      entries: [],
      selection: { path: 'a.ts', range },
    };

    expect(scopeDragPayload(withSelection, '/r/app').payload).toEqual({
      folder: '/r/app',
      entries: [],
      selection: { path: 'pkg/a.ts', range },
    });
    expect(scopeDragPayload(withSelection, '/elsewhere')).toEqual({
      payload: null,
      refused: [{ path: 'a.ts', reason: 'outsideFolder' }],
    });
  });
});

describe("adding to Claude's context — S-276, S-278", () => {
  const payload: FilesDragPayload = { folder: '/r', entries: [{ path: 'a.ts', kind: 'file' }] };

  it('takes nothing while nobody is registered to take it', () => {
    expect(claudeContextTargets.entries()).toEqual([]);
    expect(addToClaudeContext(payload)).toBe(false);
  });

  it('hands the payload to the target, once per action', () => {
    const targets = createRegistry<Parameters<typeof claudeContextTargets.register>[0]>('t');
    const add = vi.fn();
    targets.register({ id: 'claude.panel', position: 1, add });

    expect(addToClaudeContext(payload, targets)).toBe(true);
    expect(addToClaudeContext(payload, targets)).toBe(true);
    expect(add).toHaveBeenCalledTimes(2);
    expect(add).toHaveBeenNthCalledWith(1, payload);
  });
});
