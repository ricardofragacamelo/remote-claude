import { describe, expect, it, vi } from 'vitest';
import type { Envelope } from '@remote-claude/contracts';

import { createFolderWatches } from '@/shared/api/folder-watches';
import type { FolderWatchSubscriber, WatchTransport } from '@/shared/api/folder-watches';
import type { ConnectionStatus } from '@/shared/api/ws-client';

/** A transport the test drives: what was sent, and the frames and statuses it hands back. */
function aTransport() {
  let observer: ((frame: Envelope) => void) | null = null;
  let status: ((status: ConnectionStatus) => void) | null = null;
  let next = 0;
  const issued: { id: string; type: string; payload: Readonly<Record<string, unknown>> }[] = [];
  const commands: { type: string; payload: Readonly<Record<string, unknown>> }[] = [];

  const transport: WatchTransport = {
    issue: (type, payload) => {
      next += 1;
      const id = `cmd-${String(next)}`;
      issued.push({ id, type, payload });
      return id;
    },
    command: (type, payload) => {
      commands.push({ type, payload });
      return true;
    },
    observe: (listener) => {
      observer = listener;
      return () => undefined;
    },
    onStatus: (watcher) => {
      status = watcher;
      return () => undefined;
    },
  };

  function frame(overrides: Partial<Envelope>): Envelope {
    return {
      v: 1,
      id: 'srv',
      kind: 'event',
      type: 'x',
      ts: '2026-10-01T00:00:00.000Z',
      ...overrides,
    };
  }

  return {
    transport,
    issued,
    commands,
    status: (value: ConnectionStatus) => status?.(value),
    receive: (overrides: Partial<Envelope>) => observer?.(frame(overrides)),
    watching(correlationId: string, watchId: string) {
      observer?.(
        frame({
          kind: 'ack',
          type: 'workspace.watching',
          correlationId,
          payload: { watchId, workspacePath: '/r/app' },
        }),
      );
    },
    changed(watchId: string, seq: number, extra: Readonly<Record<string, unknown>> = {}) {
      observer?.(
        frame({
          type: 'workspace.filesChanged',
          seq,
          payload: { watchId, changes: [{ path: 'a.ts', kind: 'changed' }], ...extra },
        }),
      );
    },
  };
}

function aSubscriber() {
  return {
    onChanges: vi.fn<FolderWatchSubscriber['onChanges']>(),
    onWatching: vi.fn<FolderWatchSubscriber['onWatching']>(),
    onStopped: vi.fn<FolderWatchSubscriber['onStopped']>(),
    onRefused: vi.fn<FolderWatchSubscriber['onRefused']>(),
  };
}

describe('the folders a socket client follows — 07 · B-28', () => {
  it('watches once the socket is ready, and hands each change to the follower', () => {
    const wire = aTransport();
    const watches = createFolderWatches(wire.transport);
    const follower = aSubscriber();

    watches.watch('/r/app', follower);
    expect(wire.issued).toHaveLength(0);

    wire.status('ready');
    expect(wire.issued).toEqual([
      { id: 'cmd-1', type: 'workspace.watch', payload: { workspacePath: '/r/app' } },
    ]);

    wire.watching('cmd-1', 'w1');
    expect(follower.onWatching).toHaveBeenCalledWith(false);

    wire.changed('w1', 1);
    expect(follower.onChanges).toHaveBeenCalledWith([{ path: 'a.ts', kind: 'changed' }], false);
  });

  it('sends one watch for two followers of a folder, and one unwatch when the last goes', () => {
    const wire = aTransport();
    const watches = createFolderWatches(wire.transport);
    wire.status('ready');
    const explorer = aSubscriber();
    const editor = aSubscriber();

    const releaseExplorer = watches.watch('/r/app', explorer);
    wire.watching('cmd-1', 'w1');
    const releaseEditor = watches.watch('/r/app', editor);

    expect(wire.issued).toHaveLength(1);
    expect(editor.onWatching).toHaveBeenCalledWith(false);

    releaseExplorer();
    expect(wire.commands).toHaveLength(0);

    wire.changed('w1', 1);
    expect(editor.onChanges).toHaveBeenCalledTimes(1);
    expect(explorer.onChanges).not.toHaveBeenCalled();

    releaseEditor();
    releaseEditor();
    expect(wire.commands).toEqual([{ type: 'workspace.unwatch', payload: { watchId: 'w1' } }]);
  });

  it('watches again after a reconnect, and says so — there is no replay (S-191)', () => {
    const wire = aTransport();
    const watches = createFolderWatches(wire.transport);
    const follower = aSubscriber();
    watches.watch('/r/app', follower);
    wire.status('ready');
    wire.watching('cmd-1', 'w1');
    wire.changed('w1', 1);

    wire.status('reconnecting');
    wire.changed('w1', 2);
    expect(follower.onChanges).toHaveBeenCalledTimes(1);

    wire.status('ready');
    expect(wire.issued.map(({ id }) => id)).toEqual(['cmd-1', 'cmd-2']);
    wire.watching('cmd-2', 'w2');
    expect(follower.onWatching).toHaveBeenLastCalledWith(true);

    // The new subscription counts from 1 again.
    wire.changed('w2', 1);
    expect(follower.onChanges).toHaveBeenCalledTimes(2);
  });

  it('drops a frame it already applied, and tells a hole in the sequence as an overflow', () => {
    const wire = aTransport();
    const watches = createFolderWatches(wire.transport);
    const follower = aSubscriber();
    wire.status('ready');
    watches.watch('/r/app', follower);
    wire.watching('cmd-1', 'w1');

    wire.changed('w1', 1);
    wire.changed('w1', 1);
    expect(follower.onChanges).toHaveBeenCalledTimes(1);

    wire.changed('w1', 3);
    expect(follower.onChanges).toHaveBeenLastCalledWith(expect.any(Array), true);

    wire.changed('w1', 4, { overflow: true, changes: 'not a list' });
    expect(follower.onChanges).toHaveBeenLastCalledWith([], true);
  });

  it('ignores the changes of a subscription nobody here follows', () => {
    const wire = aTransport();
    const watches = createFolderWatches(wire.transport);
    const follower = aSubscriber();
    wire.status('ready');
    watches.watch('/r/app', follower);
    wire.watching('cmd-1', 'w1');

    wire.changed('w-other', 1);
    wire.receive({ type: 'workspace.watchStopped', seq: 1, payload: { watchId: 'w-other' } });
    wire.receive({ kind: 'ack', type: 'workspace.watching', correlationId: 'nope', payload: {} });
    wire.receive({
      kind: 'ack',
      type: 'workspace.watching',
      correlationId: 'nope',
      payload: { watchId: 'w9' },
    });
    wire.receive({ kind: 'error', type: 'error', correlationId: 'nope', payload: {} });
    wire.receive({ kind: 'error', type: 'error', payload: {} });
    wire.receive({ type: 'workspace.filesChanged', payload: { watchId: 'w1', changes: [] } });

    expect(follower.onChanges).not.toHaveBeenCalled();
    expect(follower.onStopped).not.toHaveBeenCalled();
    expect(follower.onRefused).not.toHaveBeenCalled();
  });

  it('tells the follower when the server stops the subscription (S-195)', () => {
    const wire = aTransport();
    const watches = createFolderWatches(wire.transport);
    const follower = aSubscriber();
    wire.status('ready');
    const release = watches.watch('/r/app', follower);
    wire.watching('cmd-1', 'w1');

    wire.receive({
      type: 'workspace.watchStopped',
      seq: 2,
      payload: { watchId: 'w1', reason: 'folderDeleted' },
    });
    expect(follower.onStopped).toHaveBeenCalledWith('folderDeleted');

    // A stopped subscription is not unwatched: the server already let it go.
    release();
    expect(wire.commands).toHaveLength(0);
  });

  it('hands a refusal of the watch to the follower, with its code and trace (S-194)', () => {
    const wire = aTransport();
    const watches = createFolderWatches(wire.transport);
    const follower = aSubscriber();
    wire.status('ready');
    watches.watch('/r/app', follower);

    wire.receive({
      kind: 'error',
      type: 'error',
      correlationId: 'cmd-1',
      traceId: 't-1',
      payload: { code: 'WATCH_UNAVAILABLE', params: { retryAfterSeconds: 30 } },
    });

    expect(follower.onRefused).toHaveBeenCalledWith({
      code: 'WATCH_UNAVAILABLE',
      params: { retryAfterSeconds: 30 },
      traceId: 't-1',
    });
  });

  it('reads a refusal it cannot make out as an internal error', () => {
    const wire = aTransport();
    const watches = createFolderWatches(wire.transport);
    const follower = aSubscriber();
    wire.status('ready');
    watches.watch('/r/app', follower);

    wire.receive({ kind: 'error', type: 'error', correlationId: 'cmd-1' });

    expect(follower.onRefused).toHaveBeenCalledWith({
      code: 'INTERNAL_ERROR',
      params: {},
      traceId: null,
    });
  });

  it('unwatches the answer of a watch whose followers left before it arrived', () => {
    const wire = aTransport();
    const watches = createFolderWatches(wire.transport);
    const follower = aSubscriber();
    wire.status('ready');
    const release = watches.watch('/r/app', follower);

    release();
    expect(wire.commands).toHaveLength(0);

    wire.watching('cmd-1', 'w1');
    expect(wire.commands).toEqual([{ type: 'workspace.unwatch', payload: { watchId: 'w1' } }]);
    expect(follower.onWatching).not.toHaveBeenCalled();
  });

  it('forgets what a socket that went owed, and sends nothing for a folder nobody follows', () => {
    const wire = aTransport();
    const watches = createFolderWatches(wire.transport);
    wire.status('ready');
    const release = watches.watch('/r/app', aSubscriber());
    release();

    wire.status('ready');
    wire.status('reconnecting');
    wire.status('ready');
    wire.watching('cmd-1', 'w1');

    expect(wire.issued).toHaveLength(1);
    expect(wire.commands).toHaveLength(0);
  });

  it('a follower that joins a subscription still on its way is told when it arrives', () => {
    const wire = aTransport();
    const watches = createFolderWatches(wire.transport);
    const first = aSubscriber();
    const second = aSubscriber();
    wire.status('ready');
    watches.watch('/r/app', first);
    watches.watch('/r/app', second);

    expect(second.onWatching).not.toHaveBeenCalled();
    wire.watching('cmd-1', 'w1');
    expect(first.onWatching).toHaveBeenCalledWith(false);
    expect(second.onWatching).toHaveBeenCalledWith(false);
  });

  it('watches two folders apart, each with its own sequence (S-153)', () => {
    const wire = aTransport();
    const watches = createFolderWatches(wire.transport);
    const app = aSubscriber();
    const pkg = aSubscriber();
    wire.status('ready');
    watches.watch('/r/app', app);
    watches.watch('/r/app/pkg', pkg);
    wire.watching('cmd-1', 'w1');
    wire.watching('cmd-2', 'w2');

    wire.changed('w2', 1);
    wire.changed('w1', 1);

    expect(app.onChanges).toHaveBeenCalledWith(expect.any(Array), false);
    expect(pkg.onChanges).toHaveBeenCalledWith(expect.any(Array), false);
  });
});
